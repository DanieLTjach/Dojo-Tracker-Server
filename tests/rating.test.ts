import request from 'supertest';
import express from 'express';
import ratingRoutes from '../src/routes/RatingRoutes.ts';
import gameRoutes from '../src/routes/GameRoutes.ts';
import userRoutes from '../src/routes/UserRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader, createTestEvent, createTelegramInitData } from './testHelpers.ts';

const app = express();
app.use(express.json());
app.use('/api', ratingRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/users', userRoutes);
app.use(handleErrors);

describe('Rating API Endpoints', () => {

    beforeEach(async () => {
        dbManager.closeDB();
        cleanupTestDatabase();
        dbManager.reinitDB();
        // Create test event for each test
        createTestEvent();
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    const SYSTEM_USER_ID = 0;
    const TEST_EVENT_ID = 1000; // Test Event created in beforeEach
    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);

    // Helper to create test users
    async function createTestUser(name: string, telegramId: number): Promise<number> {
        const initData = createTelegramInitData(telegramId, name.toLowerCase());

        const response = await request(app)
            .post('/api/users')
            .set('Authorization', adminAuthHeader)
            .query(initData)
            .send({ name });
        expect(response.status).toBe(201);
        const userId = response.body.id;

        // Activate the user
        await request(app)
            .post(`/api/users/${userId}/activate`)
            .set('Authorization', adminAuthHeader);

        return userId;
    }

    // Helper to create a test game
    async function createTestGame(authHeader: string, playersData: any[]): Promise<number> {
        const response = await request(app)
            .post('/api/games')
            .set('Authorization', authHeader)
            .send({
                eventId: TEST_EVENT_ID,
                playersData
            });
        expect(response.status).toBe(201);
        return response.body.id;
    }

    async function createGameSetup() {
        return await createGameSetupWithPoints([40000, 35000, 25000, 20000]);
    }

    function seedClubMembership(clubId: number, userId: number) {
        const ts = new Date().toISOString();
        dbManager.db.prepare(
            `INSERT OR IGNORE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'MEMBER', 'ACTIVE', ?, ?, 0)`
        ).run(clubId, userId, ts, ts);
    }

    function seedEventRegistration(eventId: number, userId: number, isFillerPlayer: boolean) {
        const ts = new Date().toISOString();
        dbManager.db.prepare(
            `INSERT OR REPLACE INTO eventRegistration (eventId, userId, status, isFillerPlayer, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'APPROVED', ?, ?, ?, 0)`
        ).run(eventId, userId, isFillerPlayer ? 1 : 0, ts, ts);
    }

    async function createGameSetupWithPoints(points: number[], chomboCounts: number[] = [0, 0, 0, 0]) {
        const user1Id = await createTestUser('Player1', 1);
        const user2Id = await createTestUser('Player2', 2);
        const user3Id = await createTestUser('Player3', 3);
        const user4Id = await createTestUser('Player4', 4);

        seedClubMembership(1, user1Id);
        seedClubMembership(1, user2Id);
        seedClubMembership(1, user3Id);
        seedClubMembership(1, user4Id);

        const user1AuthHeader = createAuthHeader(user1Id);

        const gameId = await createTestGame(user1AuthHeader, [
            { userId: user1Id, points: points[0], startPlace: 'EAST', chomboCount: chomboCounts[0] },
            { userId: user2Id, points: points[1], startPlace: 'SOUTH', chomboCount: chomboCounts[1] },
            { userId: user3Id, points: points[2], startPlace: 'WEST', chomboCount: chomboCounts[2] },
            { userId: user4Id, points: points[3], startPlace: 'NORTH', chomboCount: chomboCounts[3] }
        ]);

        return { user1Id, user2Id, user3Id, user4Id, user1AuthHeader, gameId };
    }

    describe('GET /api/events/:eventId/rating - Get All Users Current Rating', () => {
        test('should return current ratings for all users in event', async () => {
            const { user1AuthHeader } = await createGameSetup();

            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/rating`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);

            // Check structure of rating object (has nested user object)
            const rating = response.body[0];
            expect(rating).toHaveProperty('user');
            expect(rating).toHaveProperty('rating');
            expect(rating).toHaveProperty('gamesPlayed');
            expect(rating.user).toHaveProperty('id');
            expect(rating.user).toHaveProperty('name');
            expect(typeof rating.user.id).toBe('number');
            expect(typeof rating.rating).toBe('number');
            expect(typeof rating.gamesPlayed).toBe('number');
            expect(rating.gamesPlayed).toBe(1); // Should have 1 game from createGameSetup
        });

        test('should return ratings in descending order', async () => {
            const { user1AuthHeader } = await createGameSetup();

            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/rating`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);

            // Verify ratings are sorted descending
            for (let i = 0; i < response.body.length - 1; i++) {
                expect(response.body[i].rating).toBeGreaterThanOrEqual(response.body[i + 1].rating);
            }
        });

        test('should return 404 for non-existent event', async () => {
            const userId = await createTestUser('TestUser', 1);
            const authHeader = createAuthHeader(userId);

            const response = await request(app)
                .get('/api/events/99999/rating')
                .set('Authorization', authHeader);

            expect(response.status).toBe(404);
        });

        test('should track gamesPlayed correctly for multiple games', async () => {
            const { user1Id, user2Id, user3Id, user4Id, user1AuthHeader } = await createGameSetup();

            // Create a second game
            await createTestGame(user1AuthHeader, [
                { userId: user1Id, points: 35000, startPlace: 'EAST' },
                { userId: user2Id, points: 30000, startPlace: 'SOUTH' },
                { userId: user3Id, points: 30000, startPlace: 'WEST' },
                { userId: user4Id, points: 25000, startPlace: 'NORTH' }
            ]);

            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/rating`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);

            // All 4 players should have played 2 games
            for (const rating of response.body) {
                expect(rating.gamesPlayed).toBe(2);
            }
        });

        test('excludes filler players from current rating standings', async () => {
            const { user1Id, user2Id, user3Id, user4Id, user1AuthHeader } = await createGameSetup();

            seedEventRegistration(TEST_EVENT_ID, user2Id, true);

            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/rating`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(3);
            const userIds = response.body.map((r: { user: { id: number } }) => r.user.id);
            expect(userIds).toContain(user1Id);
            expect(userIds).toContain(user3Id);
            expect(userIds).toContain(user4Id);
            expect(userIds).not.toContain(user2Id);
        });

        test('includes players with non-filler registration', async () => {
            const { user1Id, user2Id, user3Id, user4Id, user1AuthHeader } = await createGameSetup();

            seedEventRegistration(TEST_EVENT_ID, user2Id, false);

            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/rating`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(4);
            const userIds = response.body.map((r: { user: { id: number } }) => r.user.id);
            expect(userIds).toEqual(expect.arrayContaining([user1Id, user2Id, user3Id, user4Id]));
        });

    });

    describe('GET /api/events/:eventId/rating/change - Get Rating Changes During Period', () => {
        test('should return rating changes for all users in period', async () => {
            const { user1AuthHeader } = await createGameSetup();

            const dateFrom = new Date(Date.now() - 86400000).toISOString(); // 1 day ago
            const dateTo = new Date(Date.now() + 86400000).toISOString(); // 1 day from now

            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/rating/change`)
                .query({ dateFrom, dateTo })
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);

            if (response.body.length > 0) {
                const change = response.body[0];
                expect(change).toHaveProperty('user');
                expect(change).toHaveProperty('ratingChange');
                expect(change.user).toHaveProperty('id');
                expect(change.user).toHaveProperty('name');
                expect(typeof change.user.id).toBe('number');
                expect(typeof change.ratingChange).toBe('number');
            }
        });

        test('should return empty array for period with no games', async () => {
            const userId = await createTestUser('TestUser', 1);
            const authHeader = createAuthHeader(userId);

            const dateFrom = new Date('2020-01-01').toISOString();
            const dateTo = new Date('2020-01-02').toISOString();

            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/rating/change`)
                .query({ dateFrom, dateTo })
                .set('Authorization', authHeader);

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('should return 400 for invalid date format', async () => {
            const userId = await createTestUser('TestUser', 1);
            const authHeader = createAuthHeader(userId);

            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/rating/change`)
                .query({ dateFrom: 'invalid-date', dateTo: new Date().toISOString() })
                .set('Authorization', authHeader);

            expect(response.status).toBe(400);
        });

        test('should require both dateFrom and dateTo', async () => {
            const userId = await createTestUser('TestUser', 1);
            const authHeader = createAuthHeader(userId);

            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/rating/change`)
                .query({ dateFrom: new Date().toISOString() })
                .set('Authorization', authHeader);

            expect(response.status).toBe(400);
        });

    });

    describe('GET /api/events/:eventId/users/:userId/rating/history - Get User Rating History', () => {
        test('should return rating history for specific user', async () => {
            const { user1Id, user1AuthHeader } = await createGameSetup();

            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/${user1Id}/rating/history`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);

            // Check structure of history entry (RatingSnapshot only has timestamp and rating)
            const historyEntry = response.body[0];
            expect(historyEntry).toHaveProperty('timestamp');
            expect(historyEntry).toHaveProperty('rating');
            expect(typeof historyEntry.rating).toBe('number');
            expect(historyEntry.timestamp).toBeTruthy();
        });

        test('should return history in chronological order', async () => {
            // Create a game setup with one game
            const { user1Id, user2Id, user3Id, user4Id, user1AuthHeader } = await createGameSetup(); 

            // Create another game to have multiple history entries
            await createTestGame(user1AuthHeader, [
                { userId: user1Id, points: 50000, startPlace: 'EAST' },
                { userId: user2Id, points: 35000, startPlace: 'SOUTH' },
                { userId: user3Id, points: 20000, startPlace: 'WEST' },
                { userId: user4Id, points: 15000, startPlace: 'NORTH' }
            ]);

            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/${user1Id}/rating/history`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(response.body.length).toBeGreaterThanOrEqual(2);

            // Verify chronological order (older first)
            for (let i = 0; i < response.body.length - 1; i++) {
                const timestamp1 = new Date(response.body[i].timestamp).getTime();
                const timestamp2 = new Date(response.body[i + 1].timestamp).getTime();
                expect(timestamp1).toBeLessThanOrEqual(timestamp2);
            }
        });

        test('should return empty array for user with no games', async () => {
            const newUserId = await createTestUser('NoGamesUser', 1);
            const authHeader = createAuthHeader(newUserId);

            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/${newUserId}/rating/history`)
                .set('Authorization', authHeader);

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('should return 404 for non-existent user', async () => {
            const userId = await createTestUser('TestUser', 1);
            const authHeader = createAuthHeader(userId);

            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/99999/rating/history`)
                .set('Authorization', authHeader);

            expect(response.status).toBe(404);
        });

        test('should return 404 for non-existent event', async () => {
            const { user1Id, user1AuthHeader } = await createGameSetup();

            const response = await request(app)
                .get(`/api/events/99999/users/${user1Id}/rating/history`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(404);
        });

    });

    describe('Rating Calculation Accuracy', () => {
        test('All players have zero score', async () => {
            const { gameId, user1AuthHeader } = await createGameSetupWithPoints([30000, 30000, 30000, 30000]);

            const response = await request(app)
                .get(`/api/games/${gameId}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('players');

            const expectedRatingChange: Record<number, number> = {
                1: 0,
                2: 0,
                3: 0,
                4: 0
            };

            const players = response.body.players;
            for (const player of players) {
                expect(player.ratingChange).toBe(expectedRatingChange[player.userId]);
            }
        });

        test('Chombo after uma penalty comes from detailed rules', async () => {
            dbManager.db.prepare(`
                UPDATE gameRules
                SET details = ?
                WHERE id = 2
            `).run(JSON.stringify({
                rules: {
                    number_of_players: 4,
                    starting_points: 30000,
                    chombo: 'twenty_thousand_after_uma'
                }
            }));

            const { gameId, user1AuthHeader } = await createGameSetupWithPoints(
                [30000, 30000, 30000, 30000],
                [1, 0, 0, 0]
            );

            const response = await request(app)
                .get(`/api/games/${gameId}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            const ratingChanges = Object.fromEntries(
                response.body.players.map((player: { userId: number; ratingChange: number }) => [player.userId, player.ratingChange])
            );

            expect(ratingChanges[1]).toBe(-20);
            expect(ratingChanges[2]).toBe(0);
            expect(ratingChanges[3]).toBe(0);
            expect(ratingChanges[4]).toBe(0);
        });

        test('Mangan chombo in detailed rules has no after-uma rating penalty', async () => {
            const { gameId, user1AuthHeader } = await createGameSetupWithPoints(
                [30000, 30000, 30000, 30000],
                [1, 0, 0, 0]
            );

            const response = await request(app)
                .get(`/api/games/${gameId}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            for (const player of response.body.players) {
                expect(player.ratingChange).toBe(0);
            }
        });

        test('One player has positive score', async () => {
            const { gameId, user1AuthHeader } = await createGameSetupWithPoints([36000, 29000, 28000, 27000]);

            const response = await request(app)
                .get(`/api/games/${gameId}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('players');

            const expectedRatingChange: Record<number, number> = {
                1: 30, // 6 + 24
                2: -3, // -1 - 2
                3: -8, // -2 - 6
                4: -19 // -3 - 16
            };

            const players = response.body.players;
            for (const player of players) {
                expect(player.ratingChange).toBe(expectedRatingChange[player.userId]);
            }
        });

        test('Two players have positive score', async () => {
            const { gameId, user1AuthHeader } = await createGameSetupWithPoints([40000, 35000, 25000, 20000]);

            const response = await request(app)
                .get(`/api/games/${gameId}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('players');

            const expectedRatingChange: Record<number, number> = {
                1: 26, // 10 + 16
                2: 13, // 5 + 8
                3: -13, // -5 - 8
                4: -26 // -10 - 16
            };

            const players = response.body.players;
            for (const player of players) {
                expect(player.ratingChange).toBe(expectedRatingChange[player.userId]);
            }
        });

        test('Three players have positive score', async () => {
            const { gameId, user1AuthHeader } = await createGameSetupWithPoints([33000, 32000, 31000, 24000]);

            const response = await request(app)
                .get(`/api/games/${gameId}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('players');

            const expectedRatingChange: Record<number, number> = {
                1: 19, // 3 + 16
                2: 8, // 2 + 6
                3: 3, // 1 + 2
                4: -30 // -6 - 24
            };

            const players = response.body.players;
            for (const player of players) {
                expect(player.ratingChange).toBe(expectedRatingChange[player.userId]);
            }
        });

        test('Two players have the same score', async () => {
            const { gameId, user1AuthHeader } = await createGameSetupWithPoints([34000, 34000, 28000, 24000]);

            const response = await request(app)
                .get(`/api/games/${gameId}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('players');

            // uma [16, 8, -8, -16] -> averaged to [12, 12, -8, -16]
            const expectedRatingChange: Record<number, number> = {
                1: 16, // 4 + 12
                2: 16, // 4 + 12
                3: -10, // -2 - 8
                4: -22 // -6 - 16
            };

            const players = response.body.players;
            for (const player of players) {
                expect(player.ratingChange).toBe(expectedRatingChange[player.userId]);
            }
        });

        test('Three players have the same score', async () => {
            const { gameId, user1AuthHeader } = await createGameSetupWithPoints([32000, 32000, 32000, 24000]);

            const response = await request(app)
                .get(`/api/games/${gameId}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('players');

            // uma [16, 6, 2, -24] -> averaged to [8, 8, 8, -24]
            const expectedRatingChange: Record<number, number> = {
                1: 10, // 2 + 8
                2: 10, // 2 + 8
                3: 10, // 2 + 8
                4: -30 // -6 - 24
            };

            const players = response.body.players;
            for (const player of players) {
                expect(player.ratingChange).toBe(expectedRatingChange[player.userId]);
            }
        });
    });

    describe('Wind tiebreak (umaTieBreak = WIND)', () => {
        const WIND_EVENT_ID = 2000;
        const WIND_GAME_RULES_ID = 100;

        function seedWindTieBreakGameRules() {
            const ts = new Date().toISOString();
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO gameRules (id, name, numberOfPlayers, uma, startingPoints, clubId, umaTieBreak)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(WIND_GAME_RULES_ID, 'Wind Tiebreak Rules', 4, '[15,5,-5,-15]', 30000, 1, 'WIND');
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO event (id, name, type, gameRules, clubId, dateFrom, dateTo, startingRating, minimumGamesForRating, modifiedBy, createdAt, modifiedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(WIND_EVENT_ID, 'Wind Tiebreak Season', 'SEASON', WIND_GAME_RULES_ID, 1,
                '2024-01-01T00:00:00.000Z', '2026-12-31T23:59:59.999Z', 1000, 0, 0, ts, ts);
        }

        async function createWindGame(authHeader: string, playersData: any[]): Promise<number> {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', authHeader)
                .send({ eventId: WIND_EVENT_ID, playersData });
            expect(response.status).toBe(201);
            return response.body.id;
        }

        async function createWindGameSetup(points: number[]) {
            seedWindTieBreakGameRules();
            const user1Id = await createTestUser('WPlayer1', 11);
            const user2Id = await createTestUser('WPlayer2', 12);
            const user3Id = await createTestUser('WPlayer3', 13);
            const user4Id = await createTestUser('WPlayer4', 14);
            seedClubMembership(1, user1Id);
            seedClubMembership(1, user2Id);
            seedClubMembership(1, user3Id);
            seedClubMembership(1, user4Id);
            const user1AuthHeader = createAuthHeader(user1Id);
            const gameId = await createWindGame(user1AuthHeader, [
                { userId: user1Id, points: points[0], startPlace: 'EAST' },
                { userId: user2Id, points: points[1], startPlace: 'SOUTH' },
                { userId: user3Id, points: points[2], startPlace: 'WEST' },
                { userId: user4Id, points: points[3], startPlace: 'NORTH' }
            ]);
            return { user1Id, user2Id, user3Id, user4Id, user1AuthHeader, gameId };
        }

        test('No tie - wind tiebreak has no effect', async () => {
            const { gameId, user1AuthHeader } = await createWindGameSetup([40000, 35000, 25000, 20000]);

            const response = await request(app)
                .get(`/api/games/${gameId}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            // uma [15, 5, -5, -15], no ties
            const expectedRatingChange: Record<number, number> = {
                1: 25, // 10 + 15
                2: 10, // 5 + 5
                3: -10, // -5 - 5
                4: -25  // -10 - 15
            };
            for (const player of response.body.players) {
                expect(player.ratingChange).toBe(expectedRatingChange[player.userId]);
            }
        });

        test('Two players tied - East beats South', async () => {
            // User1 (EAST) and User2 (SOUTH) are tied at 34000
            // uma positions 0 and 1 = [15, 5]; East gets 15, South gets 5 (no averaging)
            const { gameId, user1AuthHeader, user1Id, user2Id, user3Id, user4Id } =
                await createWindGameSetup([34000, 34000, 28000, 24000]);

            const response = await request(app)
                .get(`/api/games/${gameId}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            // uma [15, 5, -5, -15]; tied at positions 0&1 → East=15, South=5
            const expectedRatingChange: Record<number, number> = {
                [user1Id]: 19, // 4 + 15  (EAST)
                [user2Id]: 9,  // 4 + 5   (SOUTH)
                [user3Id]: -7, // -2 - 5
                [user4Id]: -21 // -6 - 15
            };
            for (const player of response.body.players) {
                expect(player.ratingChange).toBe(expectedRatingChange[player.userId]);
            }
        });

        test('Three players tied - distributed by wind priority', async () => {
            // User1 (EAST), User2 (SOUTH), User3 (WEST) all tied at 32000
            // uma positions 0,1,2 = [15, 5, -5]; East=15, South=5, West=-5
            const { gameId, user1AuthHeader, user1Id, user2Id, user3Id, user4Id } =
                await createWindGameSetup([32000, 32000, 32000, 24000]);

            const response = await request(app)
                .get(`/api/games/${gameId}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            // uma [15, 5, -5, -15]; tied at positions 0,1,2 → East=15, South=5, West=-5
            const expectedRatingChange: Record<number, number> = {
                [user1Id]: 17,  // 2 + 15  (EAST)
                [user2Id]: 7,   // 2 + 5   (SOUTH)
                [user3Id]: -3,  // 2 - 5   (WEST)
                [user4Id]: -21  // -6 - 15
            };
            for (const player of response.body.players) {
                expect(player.ratingChange).toBe(expectedRatingChange[player.userId]);
            }
        });
    });

    describe('Substitute player rating rules', () => {
        const SUBSTITUTE_RULES_ID = 2;

        function seedSubstitutePlayerRules(overrides: Record<string, number>) {
            const row = dbManager.db.prepare('SELECT details FROM gameRules WHERE id = ?').get(SUBSTITUTE_RULES_ID) as { details: string | null };
            const details = row.details !== null ? JSON.parse(row.details) : { preset: 'ema_2025', rules: {} };
            details.rules = { ...details.rules, ...overrides };
            dbManager.db.prepare('UPDATE gameRules SET details = ? WHERE id = ?').run(JSON.stringify(details), SUBSTITUTE_RULES_ID);
        }

        test('applies penalty before uma and replaces uma after tie averaging', async () => {
            seedSubstitutePlayerRules({
                substitute_player_penalty_before_uma: 5000,
                substitute_player_uma: 0
            });

            const { user1Id, user2Id, user3Id, user4Id, user1AuthHeader } =
                await createGameSetupWithPoints([34000, 34000, 28000, 24000]);

            const createResponse = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: user1Id, points: 34000, startPlace: 'EAST' },
                        { userId: user2Id, points: 34000, startPlace: 'SOUTH', isSubstitutePlayer: true },
                        { userId: user3Id, points: 28000, startPlace: 'WEST' },
                        { userId: user4Id, points: 24000, startPlace: 'NORTH' }
                    ]
                });
            expect(createResponse.status).toBe(201);

            const gameResponse = await request(app)
                .get(`/api/games/${createResponse.body.id}`)
                .set('Authorization', user1AuthHeader);

            const ratingByUserId = Object.fromEntries(
                gameResponse.body.players.map((p: { userId: number; ratingChange: number }) => [p.userId, p.ratingChange])
            );

            // penalty lowers user2 to 29000 before uma (only user1 stays at/above starting points)
            expect(ratingByUserId[user1Id]).toBe(28); // 4 + 24
            expect(ratingByUserId[user2Id]).toBe(-1); // -1 + 0 uma
            expect(ratingByUserId[user3Id]).toBe(-8); // -2 + (-6) uma
            expect(ratingByUserId[user4Id]).toBe(-22); // -6 + (-16) uma
        });

        test('averages uma for tie created by penalty, then applies substitute uma override', async () => {
            seedSubstitutePlayerRules({
                substitute_player_penalty_before_uma: 5000,
                substitute_player_uma: 0
            });

            const { user1Id, user2Id, user3Id, user4Id, user1AuthHeader } =
                await createGameSetupWithPoints([40000, 35000, 25000, 20000]);

            const createResponse = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: user1Id, points: 34000, startPlace: 'EAST' },
                        { userId: user2Id, points: 39000, startPlace: 'SOUTH', isSubstitutePlayer: true },
                        { userId: user3Id, points: 28000, startPlace: 'WEST' },
                        { userId: user4Id, points: 19000, startPlace: 'NORTH' }
                    ]
                });
            expect(createResponse.status).toBe(201);

            const gameResponse = await request(app)
                .get(`/api/games/${createResponse.body.id}`)
                .set('Authorization', user1AuthHeader);

            const ratingByUserId = Object.fromEntries(
                gameResponse.body.players.map((p: { userId: number; ratingChange: number }) => [p.userId, p.ratingChange])
            );

            // 39000 - 5000 = 34000, tying user1; uma [16,8,-8,-16] -> averaged to 12 for both leaders
            expect(ratingByUserId[user1Id]).toBe(16); // 4 + 12
            expect(ratingByUserId[user2Id]).toBe(4); // 4 + 0 (substitute uma replaces averaged 12)
            expect(ratingByUserId[user3Id]).toBe(-10); // -2 + (-8)
            expect(ratingByUserId[user4Id]).toBe(-27); // -11 + (-16)
        });

        test('recalculates rating when substitute flag changes on a finished game', async () => {
            seedSubstitutePlayerRules({
                substitute_player_penalty_before_uma: 5000,
                substitute_player_uma: 0
            });

            const { user4Id, user1AuthHeader, gameId } =
                await createGameSetupWithPoints([40000, 35000, 25000, 20000]);

            const beforeResponse = await request(app)
                .get(`/api/games/${gameId}`)
                .set('Authorization', user1AuthHeader);
            const beforeRating = beforeResponse.body.players.find((p: { userId: number }) => p.userId === user4Id).ratingChange;
            expect(beforeRating).toBe(-26);

            const patchResponse = await request(app)
                .patch(`/api/games/${gameId}/players/${user4Id}/substitute-player`)
                .set('Authorization', adminAuthHeader)
                .send({ isSubstitutePlayer: true });
            expect(patchResponse.status).toBe(200);

            const afterResponse = await request(app)
                .get(`/api/games/${gameId}`)
                .set('Authorization', user1AuthHeader);
            const afterRating = afterResponse.body.players.find((p: { userId: number }) => p.userId === user4Id).ratingChange;
            expect(afterRating).toBe(-15); // (15000 - 30000) + 0 uma after penalty applied before uma
        });
    });
});
