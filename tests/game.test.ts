import request from 'supertest';
import express from 'express';
import gameRoutes from '../src/routes/GameRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader, createTestEvent, createCustomEvent } from './testHelpers.ts';

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
        const userRoutes = (await import('../src/routes/UserRoutes.ts')).default;
        userApp.use('/api/users', userRoutes);
        userApp.use(handleErrors);

        const response = await request(userApp)
            .post('/api/users')
            .set('Authorization', adminAuthHeader)
            .send({
                name,
                telegramUsername: `@${name.toLowerCase()}`,
                telegramId
            });

        return response.body.id;
    }

    beforeAll(async () => {
        // Create test event
        createTestEvent();
        
        // Create test users for games
        testUser1Id = await createTestUser('Player1', 111111111);
        testUser2Id = await createTestUser('Player2', 222222222);
        testUser3Id = await createTestUser('Player3', 333333333);
        testUser4Id = await createTestUser('Player4', 444444444);

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

            testGameId = response.body.id; // Save for later tests
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
            expect(response.body.message).toBe(`Гравець з ID ${testUser1Id} присутній більше одного разу в цій грі`);
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
                .set('Authorization', user1AuthHeader)
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
            expect(response.body.message).toBe('Недостатньо прав для виконання цієї дії');
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
            expect(response.body.message).toBe(`Гравець з ID ${testUser1Id} присутній більше одного разу в цій грі`);
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
            expect(response.body.message).toBe('Недостатньо прав для виконання цієї дії');
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
});
