import request from 'supertest';
import express from 'express';
import gameRoutes from '../src/routes/GameRoutes.ts';
import userRoutes from '../src/routes/UserRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader, createTestEvent, createCustomEvent, createTelegramInitData } from './testHelpers.ts';
import { ExhaustiveDraw } from '../src/model/GameRoundResultModels.ts';

const app = express();
app.use(express.json());
app.use('/api/games', gameRoutes);
app.use(handleErrors);

describe('Game API Endpoints', () => {
    const SYSTEM_USER_ID = 0; // System admin user
    const TEST_EVENT_ID = 1000; // Test Event created in beforeAll
    let testUser1Id: number;
    let testUser2Id: number;
    let testUser3Id: number;
    let testUser4Id: number;
    let testGameId: number;

    // Auth headers
    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);
    let user1AuthHeader: string;

    // Helper function to create test users
    async function createTestUser(name: string, telegramId: number): Promise<number> {
        const userApp = express();
        userApp.use(express.json());
        userApp.use('/api/users', userRoutes);
        userApp.use(handleErrors);

        const initData = createTelegramInitData(telegramId, name.toLowerCase());

        const response = await request(userApp)
            .post('/api/users')
            .set('Authorization', adminAuthHeader)
            .query(initData)
            .send({ name });

        const userId = response.body.id;

        // Activate the user
        await request(userApp)
            .post(`/api/users/${userId}/activate`)
            .set('Authorization', adminAuthHeader);

        return userId;
    }

    function seedClubMembership(clubId: number, userId: number) {
        const ts = new Date().toISOString();
        dbManager.db.prepare(
            `INSERT OR IGNORE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'MEMBER', 'ACTIVE', ?, ?, 0)`
        ).run(clubId, userId, ts, ts);
    }

    beforeAll(async () => {
        // Create test event
        createTestEvent();
        
        // Create test users for games
        testUser1Id = await createTestUser('Player1', 111111111);
        testUser2Id = await createTestUser('Player2', 222222222);
        testUser3Id = await createTestUser('Player3', 333333333);
        testUser4Id = await createTestUser('Player4', 444444444);

        // Seed club memberships for test event's club (clubId=1)
        seedClubMembership(1, testUser1Id);
        seedClubMembership(1, testUser2Id);
        seedClubMembership(1, testUser3Id);
        seedClubMembership(1, testUser4Id);

        // Create auth header for regular user
        user1AuthHeader = createAuthHeader(testUser1Id);
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('POST /api/games - Create Game', () => {
        test('should create a new game with 4 players', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 40000, startPlace: 'EAST' },
                        { userId: testUser2Id, points: 35000, startPlace: 'SOUTH' },
                        { userId: testUser3Id, points: 25000, startPlace: 'WEST' },
                        { userId: testUser4Id, points: 20000, startPlace: 'NORTH' }
                    ]
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
            expect(response.body.eventId).toBe(TEST_EVENT_ID);
            expect(response.body.players).toHaveLength(4);
            expect(response.body.players[0]).toMatchObject({
                userId: testUser1Id,
                points: 40000,
                startPlace: 'EAST'
            });
            expect(response.body.tournamentRound).toBeNull();
            expect(response.body.tournamentTable).toBeNull();

            testGameId = response.body.id; // Save for later tests
        });

        test('should create a game with tournament metadata', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 40000 },
                        { userId: testUser2Id, points: 35000 },
                        { userId: testUser3Id, points: 25000 },
                        { userId: testUser4Id, points: 20000 }
                    ],
                    tournamentRound: 1,
                    tournamentTable: '3'
                });

            expect(response.status).toBe(201);
            expect(response.body.tournamentRound).toBe(1);
            expect(response.body.tournamentTable).toBe('3');
        });

        test('should reject non-positive tournamentRound', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 30000 },
                        { userId: testUser2Id, points: 30000 },
                        { userId: testUser3Id, points: 30000 },
                        { userId: testUser4Id, points: 30000 }
                    ],
                    tournamentRound: 0
                });

            expect(response.status).toBe(400);
        });

        test('should reject empty tournamentTable', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 30000 },
                        { userId: testUser2Id, points: 30000 },
                        { userId: testUser3Id, points: 30000 },
                        { userId: testUser4Id, points: 30000 }
                    ],
                    tournamentTable: ''
                });

            expect(response.status).toBe(400);
        });

        test('should create a game without startPlace', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 30000 },
                        { userId: testUser2Id, points: 30000 },
                        { userId: testUser3Id, points: 30000 },
                        { userId: testUser4Id, points: 30000 }
                    ]
                });

            expect(response.status).toBe(201);
            expect(response.body.players).toHaveLength(4);
        });

        test('should fail with incorrect number of players (3 players)', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 35000 },
                        { userId: testUser2Id, points: 30000 },
                        { userId: testUser3Id, points: 25000 }
                    ]
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Для гри потрібно 4 гравців');
        });

        test('should fail with incorrect number of players (5 players)', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 30000 },
                        { userId: testUser2Id, points: 30000 },
                        { userId: testUser3Id, points: 30000 },
                        { userId: testUser4Id, points: 30000 },
                        { userId: testUser1Id, points: 30000 }
                    ]
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Для гри потрібно 4 гравців');
        });

        test('should fail with duplicate players', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 40000 },
                        { userId: testUser1Id, points: 35000 },
                        { userId: testUser3Id, points: 25000 },
                        { userId: testUser4Id, points: 20000 }
                    ]
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(`Гравець Player1 присутній більше одного разу в цій грі`);
        });

        test('should fail with duplicate start places', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 40000, startPlace: 'EAST' },
                        { userId: testUser2Id, points: 35000, startPlace: 'EAST' },
                        { userId: testUser3Id, points: 25000, startPlace: 'WEST' },
                        { userId: testUser4Id, points: 20000, startPlace: 'NORTH' }
                    ]
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid request data');
        });

        test('should fail with non-existent event', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: 99999,
                    playersData: [
                        { userId: testUser1Id, points: 30000 },
                        { userId: testUser2Id, points: 30000 },
                        { userId: testUser3Id, points: 30000 },
                        { userId: testUser4Id, points: 30000 }
                    ]
                });

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Подію з id 99999 не знайдено');
        });

        test('should fail with non-existent user', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', adminAuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: 99999, points: 30000 },
                        { userId: testUser2Id, points: 30000 },
                        { userId: testUser3Id, points: 30000 },
                        { userId: testUser4Id, points: 30000 }
                    ]
                });

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Користувача з id 99999 не знайдено');
        });

        test('should fail with invalid points (non-integer)', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 30000.5 },
                        { userId: testUser2Id, points: 30000 },
                        { userId: testUser3Id, points: 30000 },
                        { userId: testUser4Id, points: 30000 }
                    ]
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid request data');
        });

        test('should fail with invalid startPlace', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 30000, startPlace: 'INVALID' },
                        { userId: testUser2Id, points: 30000, startPlace: 'SOUTH' },
                        { userId: testUser3Id, points: 30000, startPlace: 'WEST' },
                        { userId: testUser4Id, points: 30000, startPlace: 'NORTH' }
                    ]
                });

            expect(response.status).toBe(400);
        });

        test('should fail with incorrect total points (too low)', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 35000 },
                        { userId: testUser2Id, points: 30000 },
                        { userId: testUser3Id, points: 25000 },
                        { userId: testUser4Id, points: 20000 }
                    ]
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Сума очок повинна дорівнювати 120000, у вас 110000');
        });

        test('should fail with incorrect total points (too high)', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 40000 },
                        { userId: testUser2Id, points: 40000 },
                        { userId: testUser3Id, points: 30000 },
                        { userId: testUser4Id, points: 20000 }
                    ]
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Сума очок повинна дорівнювати 120000, у вас 130000');
        });

        test('should fail with points outside valid range (too high)', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 1000001 },
                        { userId: testUser2Id, points: 30000 },
                        { userId: testUser3Id, points: 30000 },
                        { userId: testUser4Id, points: -940001 }
                    ]
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Очки гравця (1000001) повинні бути в діапазоні від -1000000 до 1000000');
        });

        test('should fail with points outside valid range (too low)', async () => {
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: -1000001 },
                        { userId: testUser2Id, points: 1060001 },
                        { userId: testUser3Id, points: 30000 },
                        { userId: testUser4Id, points: 30000 }
                    ]
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Очки гравця (-1000001) повинні бути в діапазоні від -1000000 до 1000000');
        });

        test('should fail when event has not started yet', async () => {
            // Create an event that starts in the future
            const futureEventId = 9001;
            createCustomEvent(
                futureEventId,
                'Майбутній сезон',
                '2100-01-01T00:00:00.000Z',
                '2100-12-31T23:59:59.999Z'
            );

            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: futureEventId,
                    playersData: [
                        { userId: testUser1Id, points: 40000 },
                        { userId: testUser2Id, points: 35000 },
                        { userId: testUser3Id, points: 25000 },
                        { userId: testUser4Id, points: 20000 }
                    ]
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Майбутній сезон ще не розпочався');
        });

        test('should fail when event has already ended', async () => {
            // Create an event that ended in the past
            const pastEventId = 9002;
            createCustomEvent(
                pastEventId,
                'Минулий сезон',
                '2000-01-01T00:00:00.000Z',
                '2000-12-31T23:59:59.999Z'
            );

            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: pastEventId,
                    playersData: [
                        { userId: testUser1Id, points: 40000 },
                        { userId: testUser2Id, points: 35000 },
                        { userId: testUser3Id, points: 25000 },
                        { userId: testUser4Id, points: 20000 }
                    ]
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Минулий сезон вже закінчився');
        });
    });

    describe('POST /api/games/tracked - Create Tracked Game', () => {
        const STARTING_POINTS = 30000;

        const trackedPlayers = () => [
            { userId: testUser1Id, startPlace: 'EAST' as const },
            { userId: testUser2Id, startPlace: 'SOUTH' as const },
            { userId: testUser3Id, startPlace: 'WEST' as const },
            { userId: testUser4Id, startPlace: 'NORTH' as const }
        ];

        test('should create a tracked game and return detailed game response', async () => {
            const response = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: trackedPlayers()
                });

            expect(response.status).toBe(201);
            expect(response.body.eventId).toBe(TEST_EVENT_ID);
            expect(response.body.status).toBe('IN_PROGRESS');
            expect(response.body.startedAt).toBe(response.body.createdAt);
            expect(response.body.endedAt).toBeNull();
            expect(response.body.lastRoundWasDeleted).toBe(false);
            expect(response.body.rounds).toEqual([]);
            expect(response.body.currentState).toEqual({ wind: 'EAST', dealerNumber: 1, counters: 0, riichiSticks: 0 });
            expect(response.body.players).toHaveLength(4);
            expect(response.body.players).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    userId: testUser1Id,
                    points: STARTING_POINTS,
                    startPlace: 'EAST',
                    chomboCount: 0,
                    ratingChange: 0
                }),
                expect.objectContaining({
                    userId: testUser2Id,
                    points: STARTING_POINTS,
                    startPlace: 'SOUTH',
                    chomboCount: 0,
                    ratingChange: 0
                }),
                expect.objectContaining({
                    userId: testUser3Id,
                    points: STARTING_POINTS,
                    startPlace: 'WEST',
                    chomboCount: 0,
                    ratingChange: 0
                }),
                expect.objectContaining({
                    userId: testUser4Id,
                    points: STARTING_POINTS,
                    startPlace: 'NORTH',
                    chomboCount: 0,
                    ratingChange: 0
                })
            ]));

            const getResponse = await request(app)
                .get(`/api/games/${response.body.id}`)
                .set('Authorization', user1AuthHeader);

            expect(getResponse.status).toBe(200);
            expect(getResponse.body.status).toBe('IN_PROGRESS');
            expect(getResponse.body.startedAt).toBe(getResponse.body.createdAt);
            expect(getResponse.body.rounds).toEqual([]);
            expect(getResponse.body.currentState).toEqual({ wind: 'EAST', dealerNumber: 1, counters: 0, riichiSticks: 0 });
        });

        test('should fail with incorrect number of players', async () => {
            const response = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: [
                        { userId: testUser1Id, startPlace: 'EAST' },
                        { userId: testUser2Id, startPlace: 'SOUTH' },
                        { userId: testUser3Id, startPlace: 'WEST' }
                    ]
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Для гри потрібно 4 гравців');
        });

        test('should fail with duplicate start places', async () => {
            const response = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: [
                        { userId: testUser1Id, startPlace: 'EAST' },
                        { userId: testUser2Id, startPlace: 'EAST' },
                        { userId: testUser3Id, startPlace: 'WEST' },
                        { userId: testUser4Id, startPlace: 'NORTH' }
                    ]
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid request data');
        });

        test('should fail when startPlace is missing', async () => {
            const response = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: [
                        { userId: testUser1Id },
                        { userId: testUser2Id, startPlace: 'SOUTH' },
                        { userId: testUser3Id, startPlace: 'WEST' },
                        { userId: testUser4Id, startPlace: 'NORTH' }
                    ]
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid request data');
        });
    });

    describe('POST /api/games/:gameId/rounds/:roundId - Post Round Result', () => {
        let trackedGameId: number;

        const exhaustiveDrawResult = {
            type: 'EXHAUSTIVE_DRAW',
            riichiPlayerIds: [] as number[],
            tenpaiPlayerIds: [] as number[],
            nagashiManganPlayerIds: [] as number[]
        };

        beforeAll(async () => {
            const response = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: [
                        { userId: testUser1Id, startPlace: 'EAST' },
                        { userId: testUser2Id, startPlace: 'SOUTH' },
                        { userId: testUser3Id, startPlace: 'WEST' },
                        { userId: testUser4Id, startPlace: 'NORTH' }
                    ]
                });

            expect(response.status).toBe(201);
            trackedGameId = response.body.id;
        });

        test('should post current round result and return detailed game', async () => {
            const response = await request(app)
                .post(`/api/games/${trackedGameId}/rounds/1`)
                .set('Authorization', user1AuthHeader)
                .send(exhaustiveDrawResult);

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(trackedGameId);
            expect(response.body.status).toBe('IN_PROGRESS');
            expect(response.body.rounds).toHaveLength(1);
            expect(response.body.rounds[0]).toMatchObject({
                gameId: trackedGameId,
                roundNumber: 1,
                wind: 'EAST',
                counters: 0,
                riichiSticks: 0,
                result: {
                    ...exhaustiveDrawResult,
                    playerPointChanges: []
                }
            });
            expect(response.body.currentState).toEqual({ wind: 'EAST', dealerNumber: 2, counters: 1, riichiSticks: 0 });

            const duplicateRoundResponse = await request(app)
                .post(`/api/games/${trackedGameId}/rounds/1`)
                .set('Authorization', user1AuthHeader)
                .send(exhaustiveDrawResult);

            expect(duplicateRoundResponse.status).toBe(400);
            expect(duplicateRoundResponse.body.errorCode).toBe('roundAlreadyExists');
        });

        test('should post the next round when previous rounds exist', async () => {
            const exhaustiveDrawResult: ExhaustiveDraw = {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [],
                tenpaiPlayerIds: [],
                nagashiManganPlayerIds: []
            };

            const response = await request(app)
                .post(`/api/games/${trackedGameId}/rounds/2`)
                .set('Authorization', user1AuthHeader)
                .send(exhaustiveDrawResult);

            expect(response.status).toBe(200);
            expect(response.body.rounds).toHaveLength(2);
            expect(response.body.rounds[1]).toMatchObject({
                roundNumber: 2,
                result: {
                    ...exhaustiveDrawResult,
                    playerPointChanges: []
                }
            });

            const duplicateRoundResponse = await request(app)
                .post(`/api/games/${trackedGameId}/rounds/2`)
                .set('Authorization', user1AuthHeader)
                .send(exhaustiveDrawResult);

            expect(duplicateRoundResponse.status).toBe(400);
            expect(duplicateRoundResponse.body.errorCode).toBe('roundAlreadyExists');
        });

        test('should reject round id that is not the current round', async () => {
            const response = await request(app)
                .post(`/api/games/${trackedGameId}/rounds/99`)
                .set('Authorization', user1AuthHeader)
                .send(exhaustiveDrawResult);

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('invalidRoundId');
        });

        test('should reject posting to a finished game', async () => {
            const response = await request(app)
                .post(`/api/games/${testGameId}/rounds/1`)
                .set('Authorization', user1AuthHeader)
                .send(exhaustiveDrawResult);

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('gameNotInProgress');
        });

        test('should reject player not in the game', async () => {
            const response = await request(app)
                .post(`/api/games/${trackedGameId}/rounds/3`)
                .set('Authorization', user1AuthHeader)
                .send({
                    type: 'CHOMBO',
                    offenderPlayerId: 99999
                });

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('invalidRoundResultPlayer');
        });

        test('should reject user who is not a player or club moderator', async () => {
            const outsiderApp = express();
            outsiderApp.use(express.json());
            outsiderApp.use('/api/users', userRoutes);
            outsiderApp.use(handleErrors);

            const outsiderId = await createTestUser('Outsider', 555555555);
            const outsiderAuth = createAuthHeader(outsiderId);

            const response = await request(app)
                .post(`/api/games/${trackedGameId}/rounds/3`)
                .set('Authorization', outsiderAuth)
                .send(exhaustiveDrawResult);

            expect(response.status).toBe(403);
            expect(response.body.errorCode).toBe('notAuthorizedToModifyGame');
        });
    });

    describe('DELETE /api/games/:gameId/rounds/:roundId - Rollback Last Round', () => {
        const exhaustiveDrawResult = {
            type: 'EXHAUSTIVE_DRAW',
            riichiPlayerIds: [] as number[],
            tenpaiPlayerIds: [] as number[],
            nagashiManganPlayerIds: [] as number[]
        };

        const postRound = (gameId: number, roundId: number, authHeader: string) =>
            request(app)
                .post(`/api/games/${gameId}/rounds/${roundId}`)
                .set('Authorization', authHeader)
                .send(exhaustiveDrawResult);

        const deleteRound = (gameId: number, roundId: number, authHeader: string) =>
            request(app)
                .delete(`/api/games/${gameId}/rounds/${roundId}`)
                .set('Authorization', authHeader);

        test('should rollback the last round and return detailed game', async () => {
            const createResponse = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: [
                        { userId: testUser1Id, startPlace: 'EAST' },
                        { userId: testUser2Id, startPlace: 'SOUTH' },
                        { userId: testUser3Id, startPlace: 'WEST' },
                        { userId: testUser4Id, startPlace: 'NORTH' }
                    ]
                });

            expect(createResponse.status).toBe(201);
            const gameId = createResponse.body.id;

            await postRound(gameId, 1, user1AuthHeader);
            await postRound(gameId, 2, user1AuthHeader);

            const response = await deleteRound(gameId, 2, user1AuthHeader);

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(gameId);
            expect(response.body.status).toBe('IN_PROGRESS');
            expect(response.body.rounds).toHaveLength(1);
            expect(response.body.rounds[0].roundNumber).toBe(1);
            expect(response.body.lastRoundWasDeleted).toBe(true);
        });

        test('should rollback points applied by the last round', async () => {
            const STARTING_POINTS = 30000;

            const createResponse = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: [
                        { userId: testUser1Id, startPlace: 'EAST' },
                        { userId: testUser2Id, startPlace: 'SOUTH' },
                        { userId: testUser3Id, startPlace: 'WEST' },
                        { userId: testUser4Id, startPlace: 'NORTH' }
                    ]
                });

            const gameId = createResponse.body.id;
            await postRound(gameId, 1, user1AuthHeader);
            await postRound(gameId, 2, user1AuthHeader);

            const round2PointChanges = [
                { playerId: testUser1Id, pointChange: 5000 },
                { playerId: testUser3Id, pointChange: -5000 }
            ];

            const roundRow = dbManager.db.prepare(
                'SELECT result FROM gameRound WHERE gameId = ? AND roundNumber = 2'
            ).get(gameId) as { result: string };
            const roundResult = JSON.parse(roundRow.result);
            roundResult.playerPointChanges = round2PointChanges;
            dbManager.db.prepare(
                'UPDATE gameRound SET result = ? WHERE gameId = ? AND roundNumber = 2'
            ).run(JSON.stringify(roundResult), gameId);

            for (const { playerId, pointChange } of round2PointChanges) {
                dbManager.db.prepare(
                    'UPDATE userToGame SET points = points + ? WHERE gameId = ? AND userId = ?'
                ).run(pointChange, gameId, playerId);
            }

            const beforeRollback = await request(app)
                .get(`/api/games/${gameId}`)
                .set('Authorization', user1AuthHeader);

            expect(beforeRollback.body.players.find((p: { userId: number }) => p.userId === testUser1Id).points).toBe(35000);
            expect(beforeRollback.body.players.find((p: { userId: number }) => p.userId === testUser3Id).points).toBe(25000);

            const response = await deleteRound(gameId, 2, user1AuthHeader);

            expect(response.status).toBe(200);
            for (const userId of [testUser1Id, testUser2Id, testUser3Id, testUser4Id]) {
                expect(response.body.players.find((p: { userId: number }) => p.userId === userId).points).toBe(STARTING_POINTS);
            }
        });

        test('should reject rollback when round id is not the last round', async () => {
            const createResponse = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: [
                        { userId: testUser1Id, startPlace: 'EAST' },
                        { userId: testUser2Id, startPlace: 'SOUTH' },
                        { userId: testUser3Id, startPlace: 'WEST' },
                        { userId: testUser4Id, startPlace: 'NORTH' }
                    ]
                });

            const gameId = createResponse.body.id;
            await postRound(gameId, 1, user1AuthHeader);
            await postRound(gameId, 2, user1AuthHeader);

            const response = await deleteRound(gameId, 1, user1AuthHeader);

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('invalidRoundId');
        });

        test('should reject rollback when round id is bigger than the last round', async () => {
            const createResponse = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: [
                        { userId: testUser1Id, startPlace: 'EAST' },
                        { userId: testUser2Id, startPlace: 'SOUTH' },
                        { userId: testUser3Id, startPlace: 'WEST' },
                        { userId: testUser4Id, startPlace: 'NORTH' }
                    ]
                });

            const gameId = createResponse.body.id;
            await postRound(gameId, 1, user1AuthHeader);
            await postRound(gameId, 2, user1AuthHeader);

            const response = await deleteRound(gameId, 3, user1AuthHeader);

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('invalidRoundId');
        });

        test('should reject rollback when the game has no rounds', async () => {
            const createResponse = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: [
                        { userId: testUser1Id, startPlace: 'EAST' },
                        { userId: testUser2Id, startPlace: 'SOUTH' },
                        { userId: testUser3Id, startPlace: 'WEST' },
                        { userId: testUser4Id, startPlace: 'NORTH' }
                    ]
                });

            const response = await deleteRound(createResponse.body.id, 1, user1AuthHeader);

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('noRoundsToRollback');
        });

        test('should allow a player to rollback only once', async () => {
            const createResponse = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: [
                        { userId: testUser1Id, startPlace: 'EAST' },
                        { userId: testUser2Id, startPlace: 'SOUTH' },
                        { userId: testUser3Id, startPlace: 'WEST' },
                        { userId: testUser4Id, startPlace: 'NORTH' }
                    ]
                });

            const gameId = createResponse.body.id;
            await postRound(gameId, 1, user1AuthHeader);
            await postRound(gameId, 2, user1AuthHeader);

            const firstRollback = await deleteRound(gameId, 2, user1AuthHeader);
            expect(firstRollback.status).toBe(200);
            expect(firstRollback.body.lastRoundWasDeleted).toBe(true);

            const secondRollback = await deleteRound(gameId, 1, user1AuthHeader);
            expect(secondRollback.status).toBe(400);
            expect(secondRollback.body.errorCode).toBe('lastRoundRollbackAlreadyUsed');
        });

        test('should allow admins to rollback multiple times in a row', async () => {
            const createResponse = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: [
                        { userId: testUser1Id, startPlace: 'EAST' },
                        { userId: testUser2Id, startPlace: 'SOUTH' },
                        { userId: testUser3Id, startPlace: 'WEST' },
                        { userId: testUser4Id, startPlace: 'NORTH' }
                    ]
                });

            const gameId = createResponse.body.id;
            await postRound(gameId, 1, user1AuthHeader);
            await postRound(gameId, 2, user1AuthHeader);

            const firstRollback = await deleteRound(gameId, 2, adminAuthHeader);
            expect(firstRollback.status).toBe(200);
            expect(firstRollback.body.lastRoundWasDeleted).toBe(true);

            const secondRollback = await deleteRound(gameId, 1, adminAuthHeader);
            expect(secondRollback.status).toBe(200);
            expect(secondRollback.body.rounds).toHaveLength(0);
        });

        test('should allow rollback after the round was rollbacked than added back', async () => {
            const createResponse = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: [
                        { userId: testUser1Id, startPlace: 'EAST' },
                        { userId: testUser2Id, startPlace: 'SOUTH' },
                        { userId: testUser3Id, startPlace: 'WEST' },
                        { userId: testUser4Id, startPlace: 'NORTH' }
                    ]
                });

            const gameId = createResponse.body.id;
            await postRound(gameId, 1, user1AuthHeader);
            await postRound(gameId, 2, user1AuthHeader);

            const firstRollback = await deleteRound(gameId, 2, user1AuthHeader);
            expect(firstRollback.status).toBe(200);
            expect(firstRollback.body.lastRoundWasDeleted).toBe(true);

            const secondRound = await postRound(gameId, 2, user1AuthHeader);
            expect(secondRound.status).toBe(200);
            expect(secondRound.body.lastRoundWasDeleted).toBe(false);

            const secondRollback = await deleteRound(gameId, 2, user1AuthHeader);
            expect(secondRollback.status).toBe(200);
            expect(secondRollback.body.lastRoundWasDeleted).toBe(true);
        });

        test('should reject rollback on a finished game', async () => {
            const response = await deleteRound(testGameId, 1, user1AuthHeader);

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('gameNotInProgress');
        });

        test('should reject user who is not a player or club moderator', async () => {
            const createResponse = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: [
                        { userId: testUser1Id, startPlace: 'EAST' },
                        { userId: testUser2Id, startPlace: 'SOUTH' },
                        { userId: testUser3Id, startPlace: 'WEST' },
                        { userId: testUser4Id, startPlace: 'NORTH' }
                    ]
                });

            const gameId = createResponse.body.id;
            await postRound(gameId, 1, user1AuthHeader);

            const outsiderId = await createTestUser('Rollback Outsider', 555555556);
            const outsiderAuth = createAuthHeader(outsiderId);

            const response = await deleteRound(gameId, 1, outsiderAuth);

            expect(response.status).toBe(403);
            expect(response.body.errorCode).toBe('notAuthorizedToModifyGame');
        });
    });

    describe('POST /api/games/:gameId/finish - Finish Game', () => {
        const exhaustiveDrawResult = {
            type: 'EXHAUSTIVE_DRAW',
            riichiPlayerIds: [] as number[],
            tenpaiPlayerIds: [] as number[],
            nagashiManganPlayerIds: [] as number[]
        };

        const postRound = (gameId: number, roundId: number, authHeader: string) =>
            request(app)
                .post(`/api/games/${gameId}/rounds/${roundId}`)
                .set('Authorization', authHeader)
                .send(exhaustiveDrawResult);

        const finishGame = (gameId: number, authHeader: string) =>
            request(app)
                .post(`/api/games/${gameId}/finish`)
                .set('Authorization', authHeader);

        test('should finish an in-progress game with at least one round', async () => {
            const createResponse = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: [
                        { userId: testUser1Id, startPlace: 'EAST' },
                        { userId: testUser2Id, startPlace: 'SOUTH' },
                        { userId: testUser3Id, startPlace: 'WEST' },
                        { userId: testUser4Id, startPlace: 'NORTH' }
                    ]
                });

            expect(createResponse.status).toBe(201);
            const gameId = createResponse.body.id;

            await postRound(gameId, 1, user1AuthHeader);

            const response = await finishGame(gameId, user1AuthHeader);

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(gameId);
            expect(response.body.status).toBe('FINISHED');
            expect(response.body.endedAt).not.toBeNull();
            expect(response.body.currentState).toBeNull();
            expect(response.body.rounds).toHaveLength(1);
            response.body.players.forEach((player: { ratingChange: number }) => {
                expect(typeof player.ratingChange).toBe('number');
            });
        });

        test('should reject finishing a game with no rounds', async () => {
            const createResponse = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: [
                        { userId: testUser1Id, startPlace: 'EAST' },
                        { userId: testUser2Id, startPlace: 'SOUTH' },
                        { userId: testUser3Id, startPlace: 'WEST' },
                        { userId: testUser4Id, startPlace: 'NORTH' }
                    ]
                });

            const response = await finishGame(createResponse.body.id, user1AuthHeader);

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('noRoundsCompleted');
        });

        test('should reject finishing an already finished game', async () => {
            const createResponse = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: [
                        { userId: testUser1Id, startPlace: 'EAST' },
                        { userId: testUser2Id, startPlace: 'SOUTH' },
                        { userId: testUser3Id, startPlace: 'WEST' },
                        { userId: testUser4Id, startPlace: 'NORTH' }
                    ]
                });

            const gameId = createResponse.body.id;
            await postRound(gameId, 1, user1AuthHeader);

            const firstFinish = await finishGame(gameId, user1AuthHeader);
            expect(firstFinish.status).toBe(200);

            const secondFinish = await finishGame(gameId, user1AuthHeader);
            expect(secondFinish.status).toBe(400);
            expect(secondFinish.body.errorCode).toBe('gameNotInProgress');
        });

        test('should reject finishing a score-only game that is already finished', async () => {
            const response = await finishGame(testGameId, user1AuthHeader);

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('gameNotInProgress');
        });

        test('should reject user who is not a player or club moderator', async () => {
            const createResponse = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    players: [
                        { userId: testUser1Id, startPlace: 'EAST' },
                        { userId: testUser2Id, startPlace: 'SOUTH' },
                        { userId: testUser3Id, startPlace: 'WEST' },
                        { userId: testUser4Id, startPlace: 'NORTH' }
                    ]
                });

            const gameId = createResponse.body.id;
            await postRound(gameId, 1, user1AuthHeader);

            const outsiderId = await createTestUser('Finish Outsider', 555555557);
            const outsiderAuth = createAuthHeader(outsiderId);

            const response = await finishGame(gameId, outsiderAuth);

            expect(response.status).toBe(403);
            expect(response.body.errorCode).toBe('notAuthorizedToModifyGame');
        });
    });

    describe('GET /api/games/:gameId - Get Game by ID', () => {
        test('should retrieve a game by ID', async () => {
            const response = await request(app)
                .get(`/api/games/${testGameId}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(testGameId);
            expect(response.body.eventId).toBe(TEST_EVENT_ID);
            expect(response.body.players).toHaveLength(4);
            expect(response.body).toHaveProperty('createdAt');
            expect(response.body).toHaveProperty('modifiedAt');
            expect(response.body.status).toBe('FINISHED');
            expect(response.body.lastRoundWasDeleted).toBe(false);
            expect(response.body.rounds).toEqual([]);
            expect(response.body.currentState).toBeNull();

            // Verify players have ratingChange field
            response.body.players.forEach((player: any) => {
                expect(player).toHaveProperty('ratingChange');
                expect(typeof player.ratingChange === 'number' || player.ratingChange === null).toBe(true);
            });
        });

        test('should return game rounds in roundNumber order with parsed result', async () => {
            const createResponse = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 30000 },
                        { userId: testUser2Id, points: 30000 },
                        { userId: testUser3Id, points: 30000 },
                        { userId: testUser4Id, points: 30000 }
                    ]
                });

            expect(createResponse.status).toBe(201);
            const gameId = createResponse.body.id;

            const roundOneResult = {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [testUser1Id],
                tenpaiPlayerIds: [testUser1Id, testUser2Id],
                nagashiManganPlayerIds: []
            };
            const roundTwoResult = {
                type: 'CHOMBO',
                offenderPlayerId: testUser3Id
            };

            dbManager.db.prepare(`
                INSERT INTO gameRound (gameId, roundNumber, wind, dealerNumber, counters, riichiSticks, result)
                VALUES (?, 2, 'EAST', 2, 1, 0, ?),
                       (?, 1, 'EAST', 1, 0, 1, ?)
            `).run(
                gameId,
                JSON.stringify(roundTwoResult),
                gameId,
                JSON.stringify(roundOneResult)
            );

            const response = await request(app)
                .get(`/api/games/${gameId}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(response.body.rounds).toEqual([
                {
                    gameId,
                    roundNumber: 1,
                    wind: 'EAST',
                    dealerNumber: 1,
                    counters: 0,
                    riichiSticks: 1,
                    result: roundOneResult
                },
                {
                    gameId,
                    roundNumber: 2,
                    wind: 'EAST',
                    dealerNumber: 2,
                    counters: 1,
                    riichiSticks: 0,
                    result: roundTwoResult
                }
            ]);
        });

        test('should fail with non-existent game ID', async () => {
            const response = await request(app)
                .get('/api/games/99999')
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Гру з id 99999 не знайдено');
        });

        test('should fail with invalid game ID (non-integer)', async () => {
            const response = await request(app)
                .get('/api/games/invalid')
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid request data');
        });
    });

    describe('GET /api/games - Get Games with Filters', () => {
        test('should retrieve all games without filters', async () => {
            const response = await request(app)
                .get('/api/games')
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0]).toHaveProperty('id');
            expect(response.body[0]).toHaveProperty('eventId');
            expect(response.body[0]).toHaveProperty('players');
        });

        test('should filter games by eventId', async () => {
            const response = await request(app)
                .get(`/api/games?eventId=${TEST_EVENT_ID}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            response.body.forEach((game: any) => {
                expect(game.eventId).toBe(TEST_EVENT_ID);
            });
        });

        test('should filter games by clubId', async () => {
            const otherClubId = 930;
            const otherClubEventId = 9300;
            const timestamp = '2024-01-01T00:00:00.000Z';

            dbManager.db.prepare(
                `INSERT INTO club (id, name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(otherClubId, 'Game Filter Test Club', null, null, null, null, 1, timestamp, timestamp, 0);

            seedClubMembership(otherClubId, testUser1Id);
            seedClubMembership(otherClubId, testUser2Id);
            seedClubMembership(otherClubId, testUser3Id);
            seedClubMembership(otherClubId, testUser4Id);

            createCustomEvent(otherClubEventId, 'Інший клубний сезон', undefined, undefined, 2, otherClubId);

            await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: otherClubEventId,
                    playersData: [
                        { userId: testUser1Id, points: 40000, startPlace: 'EAST' },
                        { userId: testUser2Id, points: 35000, startPlace: 'SOUTH' },
                        { userId: testUser3Id, points: 25000, startPlace: 'WEST' },
                        { userId: testUser4Id, points: 20000, startPlace: 'NORTH' }
                    ]
                });

            const response = await request(app)
                .get(`/api/games?clubId=${otherClubId}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            response.body.forEach((game: any) => {
                expect(game.eventId).toBe(otherClubEventId);
            });
        });

        test('should filter games by userId', async () => {
            const response = await request(app)
                .get(`/api/games?userId=${testUser1Id}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            response.body.forEach((game: any) => {
                const userIds = game.players.map((p: any) => p.userId);
                expect(userIds).toContain(testUser1Id);
            });
        });

        test('should filter games by dateFrom', async () => {
            const dateFrom = new Date('2024-01-01').toISOString();
            const response = await request(app)
                .get(`/api/games?dateFrom=${dateFrom}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('should filter games by dateTo', async () => {
            const dateTo = new Date('2025-12-31').toISOString();
            const response = await request(app)
                .get(`/api/games?dateTo=${dateTo}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('should filter games by date range', async () => {
            const dateFrom = new Date('2024-01-01').toISOString();
            const dateTo = new Date('2025-12-31').toISOString();
            const response = await request(app)
                .get(`/api/games?dateFrom=${dateFrom}&dateTo=${dateTo}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('should filter games by multiple criteria', async () => {
            const response = await request(app)
                .get(`/api/games?eventId=${TEST_EVENT_ID}&userId=${testUser1Id}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            response.body.forEach((game: any) => {
                expect(game.eventId).toBe(TEST_EVENT_ID);
                const userIds = game.players.map((p: any) => p.userId);
                expect(userIds).toContain(testUser1Id);
            });
        });

        test('should return empty array for non-existent userId filter', async () => {
            const response = await request(app)
                .get('/api/games?userId=99999')
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Користувача з id 99999 не знайдено');
        });

        test('should fail with invalid dateFrom format', async () => {
            const response = await request(app)
                .get('/api/games?dateFrom=invalid-date')
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid request data');
        });
    });

    describe('PUT /api/games/:gameId - Update Game', () => {
        test('should update a game successfully', async () => {
            const response = await request(app)
                .put(`/api/games/${testGameId}`)
                .set('Authorization', adminAuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 45000, startPlace: 'EAST' },
                        { userId: testUser2Id, points: 35000, startPlace: 'SOUTH' },
                        { userId: testUser3Id, points: 25000, startPlace: 'WEST' },
                        { userId: testUser4Id, points: 15000, startPlace: 'NORTH' }
                    ]
                });

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(testGameId);
            expect(response.body.players[0].points).toBe(45000);
        });

        test('should update a game with tournament metadata', async () => {
            const response = await request(app)
                .put(`/api/games/${testGameId}`)
                .set('Authorization', adminAuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 45000 },
                        { userId: testUser2Id, points: 35000 },
                        { userId: testUser3Id, points: 25000 },
                        { userId: testUser4Id, points: 15000 }
                    ],
                    tournamentRound: 2,
                    tournamentTable: '5'
                });

            expect(response.status).toBe(200);
            expect(response.body.tournamentRound).toBe(2);
            expect(response.body.tournamentTable).toBe('5');
        });

        test('should clear tournament metadata by passing null', async () => {
            const response = await request(app)
                .put(`/api/games/${testGameId}`)
                .set('Authorization', adminAuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 45000 },
                        { userId: testUser2Id, points: 35000 },
                        { userId: testUser3Id, points: 25000 },
                        { userId: testUser4Id, points: 15000 }
                    ],
                    tournamentRound: null,
                    tournamentTable: null
                });

            expect(response.status).toBe(200);
            expect(response.body.tournamentRound).toBeNull();
            expect(response.body.tournamentTable).toBeNull();
        });

        test('should fail to update game without admin privileges', async () => {
            const response = await request(app)
                .put(`/api/games/${testGameId}`)
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 30000 },
                        { userId: testUser2Id, points: 30000 },
                        { userId: testUser3Id, points: 30000 },
                        { userId: testUser4Id, points: 30000 }
                    ]
                });

            expect(response.status).toBe(403);
        });

        test('should fail to update non-existent game', async () => {
            const response = await request(app)
                .put('/api/games/99999')
                .set('Authorization', adminAuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 30000 },
                        { userId: testUser2Id, points: 30000 },
                        { userId: testUser3Id, points: 30000 },
                        { userId: testUser4Id, points: 30000 }
                    ]
                });

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Гру з id 99999 не знайдено');
        });

        test('should fail to update game with incorrect player count', async () => {
            const response = await request(app)
                .put(`/api/games/${testGameId}`)
                .set('Authorization', adminAuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 30000 },
                        { userId: testUser2Id, points: 30000 }
                    ]
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Для гри потрібно 4 гравців');
        });

        test('should fail to update game with duplicate players', async () => {
            const response = await request(app)
                .put(`/api/games/${testGameId}`)
                .set('Authorization', adminAuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 30000 },
                        { userId: testUser1Id, points: 30000 },
                        { userId: testUser3Id, points: 30000 },
                        { userId: testUser4Id, points: 30000 }
                    ]
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toBe(`Гравець Player1 присутній більше одного разу в цій грі`);
        });
    });

    describe('DELETE /api/games/:gameId - Delete Game', () => {
        let gameToDeleteId: number;

        beforeAll(async () => {
            // Create a game to delete
            const response = await request(app)
                .post('/api/games')
                .set('Authorization', user1AuthHeader)
                .send({
                    eventId: TEST_EVENT_ID,
                    playersData: [
                        { userId: testUser1Id, points: 30000 },
                        { userId: testUser2Id, points: 30000 },
                        { userId: testUser3Id, points: 30000 },
                        { userId: testUser4Id, points: 30000 }
                    ]
                });
            gameToDeleteId = response.body.id;
        });

        test('should delete a game successfully', async () => {
            const response = await request(app)
                .delete(`/api/games/${gameToDeleteId}`)
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(204);
            expect(response.body).toEqual({});

            // Verify game is deleted
            const getResponse = await request(app)
                .get(`/api/games/${gameToDeleteId}`)
                .set('Authorization', adminAuthHeader);
            expect(getResponse.status).toBe(404);
        });

        test('should fail to delete game without admin privileges', async () => {
            const response = await request(app)
                .delete(`/api/games/${testGameId}`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(403);
        });

        test('should fail to delete non-existent game', async () => {
            const response = await request(app)
                .delete('/api/games/99999')
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Гру з id 99999 не знайдено');
        });

        test('should fail to delete game with invalid ID', async () => {
            const response = await request(app)
                .delete('/api/games/invalid')
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid request data');
        });
    });

    describe('Custom createdAt field - Admin privileges', () => {
        describe('POST /api/games - Create Game with custom createdAt', () => {
            test('should allow admin to create a game with custom createdAt', async () => {
                const customDate = new Date('2024-06-15T14:30:00.000Z');
                const response = await request(app)
                    .post('/api/games')
                    .set('Authorization', adminAuthHeader)
                    .send({
                        eventId: TEST_EVENT_ID,
                        playersData: [
                            { userId: testUser1Id, points: 40000, startPlace: 'EAST' },
                            { userId: testUser2Id, points: 35000, startPlace: 'SOUTH' },
                            { userId: testUser3Id, points: 25000, startPlace: 'WEST' },
                            { userId: testUser4Id, points: 20000, startPlace: 'NORTH' }
                        ],
                        createdAt: customDate.toISOString()
                    });

                expect(response.status).toBe(201);
                expect(response.body).toHaveProperty('id');
                expect(response.body.eventId).toBe(TEST_EVENT_ID);
                expect(response.body.players).toHaveLength(4);
                expect(new Date(response.body.createdAt).getTime()).toBe(customDate.getTime());
            });

            test('should prevent non-admin from creating a game with custom createdAt', async () => {
                const customDate = new Date('2024-06-15T15:30:00.000Z');
                const response = await request(app)
                    .post('/api/games')
                    .set('Authorization', user1AuthHeader)
                    .send({
                        eventId: TEST_EVENT_ID,
                        playersData: [
                            { userId: testUser1Id, points: 40000, startPlace: 'EAST' },
                            { userId: testUser2Id, points: 35000, startPlace: 'SOUTH' },
                            { userId: testUser3Id, points: 25000, startPlace: 'WEST' },
                            { userId: testUser4Id, points: 20000, startPlace: 'NORTH' }
                        ],
                        createdAt: customDate.toISOString()
                    });

                expect(response.status).toBe(403);
                expect(response.body.message).toBe('Щоб створити гру з заданим часом, ви повинні бути адміністратором');
            });

            test('should allow non-admin to create a game without createdAt field', async () => {
                const response = await request(app)
                    .post('/api/games')
                    .set('Authorization', user1AuthHeader)
                    .send({
                        eventId: TEST_EVENT_ID,
                        playersData: [
                            { userId: testUser1Id, points: 40000 },
                            { userId: testUser2Id, points: 35000 },
                            { userId: testUser3Id, points: 25000 },
                            { userId: testUser4Id, points: 20000 }
                        ]
                    });

                expect(response.status).toBe(201);
                expect(response.body).toHaveProperty('id');
                expect(response.body).toHaveProperty('createdAt');
                // Verify createdAt is automatically set to current time (approximately)
                const createdAtTime = new Date(response.body.createdAt).getTime();
                const now = Date.now();
                expect(Math.abs(createdAtTime - now)).toBeLessThan(5000); // Within 5 seconds
            });
        });

        describe('PUT /api/games/:gameId - Update Game with custom createdAt', () => {
            let gameToUpdateId: number;
            const originalDate = new Date('2024-06-10T10:00:00.000Z');

            beforeAll(async () => {
                // Create a game with a custom date as admin
                const response = await request(app)
                    .post('/api/games')
                    .set('Authorization', adminAuthHeader)
                    .send({
                        eventId: TEST_EVENT_ID,
                        playersData: [
                            { userId: testUser1Id, points: 30000 },
                            { userId: testUser2Id, points: 30000 },
                            { userId: testUser3Id, points: 30000 },
                            { userId: testUser4Id, points: 30000 }
                        ],
                        createdAt: originalDate.toISOString()
                    });
                gameToUpdateId = response.body.id;
            });

            test('should allow admin to update game with new createdAt', async () => {
                const newDate = new Date('2024-06-11T12:00:00.000Z');
                const response = await request(app)
                    .put(`/api/games/${gameToUpdateId}`)
                    .set('Authorization', adminAuthHeader)
                    .send({
                        eventId: TEST_EVENT_ID,
                        playersData: [
                            { userId: testUser1Id, points: 40000 },
                            { userId: testUser2Id, points: 35000 },
                            { userId: testUser3Id, points: 25000 },
                            { userId: testUser4Id, points: 20000 }
                        ],
                        createdAt: newDate.toISOString()
                    });

                expect(response.status).toBe(200);
                expect(response.body.id).toBe(gameToUpdateId);
                expect(new Date(response.body.createdAt).getTime()).toBe(newDate.getTime());
            });

            test('should allow admin to update game without changing createdAt', async () => {
                const response = await request(app)
                    .put(`/api/games/${gameToUpdateId}`)
                    .set('Authorization', adminAuthHeader)
                    .send({
                        eventId: TEST_EVENT_ID,
                        playersData: [
                            { userId: testUser1Id, points: 35000 },
                            { userId: testUser2Id, points: 35000 },
                            { userId: testUser3Id, points: 30000 },
                            { userId: testUser4Id, points: 20000 }
                        ]
                    });

                expect(response.status).toBe(200);
                expect(response.body.id).toBe(gameToUpdateId);
                // createdAt should remain unchanged from the previous update
                const newDate = new Date('2024-06-11T12:00:00.000Z');
                expect(new Date(response.body.createdAt).getTime()).toBe(newDate.getTime());
            });
        });
    });
});
