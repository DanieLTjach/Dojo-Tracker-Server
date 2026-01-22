import request from 'supertest';
import express from 'express';
import ratingRoutes from '../src/routes/RatingRoutes.ts';
import gameRoutes from '../src/routes/GameRoutes.ts';
import userRoutes from '../src/routes/UserRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader, createTestEvent } from './testHelpers.ts';

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
        await createTestEvent();
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
        const response = await request(app)
            .post('/api/users')
            .set('Authorization', adminAuthHeader)
            .send({
                name,
                telegramUsername: `@${name.toLowerCase()}`,
                telegramId
            });
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

    // Helper to create a complete game setup with 4 players
    async function createGameSetupWithPoints(points: number[]) {
        const user1Id = await createTestUser('Player1', 1);
        const user2Id = await createTestUser('Player2', 2);
        const user3Id = await createTestUser('Player3', 3);
        const user4Id = await createTestUser('Player4', 4);

        const user1AuthHeader = createAuthHeader(user1Id);

        const gameId = await createTestGame(user1AuthHeader, [
            { userId: user1Id, points: points[0], startPlace: 'EAST' },
            { userId: user2Id, points: points[1], startPlace: 'SOUTH' },
            { userId: user3Id, points: points[2], startPlace: 'WEST' },
            { userId: user4Id, points: points[3], startPlace: 'NORTH' }
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
            expect(rating.user).toHaveProperty('id');
            expect(rating.user).toHaveProperty('name');
            expect(typeof rating.user.id).toBe('number');
            expect(typeof rating.rating).toBe('number');
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
                { userId: user1Id, points: 40000, startPlace: 'EAST' },
                { userId: user2Id, points: 25000, startPlace: 'SOUTH' },
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
});
