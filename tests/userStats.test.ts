import request from 'supertest';
import express from 'express';
import userStatsRoutes from '../src/routes/UserStatsRoutes.ts';
import gameRoutes from '../src/routes/GameRoutes.ts';
import userRoutes from '../src/routes/UserRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader } from './testHelpers.ts';

const app = express();
app.use(express.json());
app.use('/api/events', userStatsRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/users', userRoutes);
app.use(handleErrors);

describe('User Stats API Endpoints', () => {
    const SYSTEM_USER_ID = 0;
    const TEST_EVENT_ID = 1; // Test Event from migrations

    let testUser1Id: number;
    let testUser2Id: number;
    let testUser3Id: number;
    let testUser4Id: number;
    let testUser5Id: number; // User who hasn't played any games

    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);
    let user1AuthHeader: string;

    // Helper to create test users
    async function createTestUser(name: string, telegramId: number): Promise<number> {
        const response = await request(app)
            .post('/api/users')
            .set('Authorization', adminAuthHeader)
            .send({
                name,
                telegramUsername: `@${name.toLowerCase()}`,
                telegramId,
            });
        const userId = response.body.id;

        // Activate the user
        await request(app)
            .post(`/api/users/${userId}/activate`)
            .set('Authorization', adminAuthHeader);

        return userId;
    }

    // Helper to create a test game
    async function createTestGame(authHeader: string, playersData: any[]): Promise<number> {
        const response = await request(app).post('/api/games').set('Authorization', authHeader).send({
            eventId: TEST_EVENT_ID,
            playersData,
        });
        return response.body.id;
    }

    beforeAll(async () => {
        // Create test users
        testUser1Id = await createTestUser('StatsPlayer1', 311111111);
        testUser2Id = await createTestUser('StatsPlayer2', 322222222);
        testUser3Id = await createTestUser('StatsPlayer3', 333333333);
        testUser4Id = await createTestUser('StatsPlayer4', 344444444);
        testUser5Id = await createTestUser('StatsPlayer5', 355555555);

        user1AuthHeader = createAuthHeader(testUser1Id);

        // Create multiple test games with varied results for comprehensive stats
        // Game 1: User1 wins with high points
        await createTestGame(user1AuthHeader, [
            { userId: testUser1Id, points: 40000, startPlace: 'EAST' },
            { userId: testUser2Id, points: 25000, startPlace: 'SOUTH' },
            { userId: testUser3Id, points: 20000, startPlace: 'WEST' },
            { userId: testUser4Id, points: 15000, startPlace: 'NORTH' },
        ]);

        // Game 2: User1 gets 2nd place
        await createTestGame(user1AuthHeader, [
            { userId: testUser2Id, points: 35000, startPlace: 'EAST' },
            { userId: testUser1Id, points: 30000, startPlace: 'SOUTH' },
            { userId: testUser3Id, points: 20000, startPlace: 'WEST' },
            { userId: testUser4Id, points: 15000, startPlace: 'NORTH' },
        ]);

        // Game 3: User1 gets 3rd place
        await createTestGame(user1AuthHeader, [
            { userId: testUser3Id, points: 40000, startPlace: 'EAST' },
            { userId: testUser2Id, points: 35000, startPlace: 'SOUTH' },
            { userId: testUser1Id, points: 20000, startPlace: 'WEST' },
            { userId: testUser4Id, points: 5000, startPlace: 'NORTH' },
        ]);

        // Game 4: User1 gets 4th place (last) with negative points
        await createTestGame(user1AuthHeader, [
            { userId: testUser2Id, points: 40000, startPlace: 'EAST' },
            { userId: testUser3Id, points: 35000, startPlace: 'SOUTH' },
            { userId: testUser4Id, points: 30000, startPlace: 'WEST' },
            { userId: testUser1Id, points: -5000, startPlace: 'NORTH' },
        ]);
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('GET /api/events/:eventId/users/:userId/stats - Get User Event Stats', () => {
        test('should return comprehensive stats for a user with multiple games', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/${testUser1Id}/stats`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('userId', testUser1Id);
            expect(response.body).toHaveProperty('eventId', TEST_EVENT_ID);

            // Basic stats
            expect(response.body).toHaveProperty('gamesPlayed');
            expect(response.body.gamesPlayed).toBe(4);
            expect(response.body).toHaveProperty('playerRating');
            expect(response.body).toHaveProperty('place');

            // Placement percentages
            expect(response.body).toHaveProperty('percentageFirstPlace');
            expect(response.body).toHaveProperty('percentageSecondPlace');
            expect(response.body).toHaveProperty('percentageThirdPlace');
            expect(response.body).toHaveProperty('percentageFourthPlace');

            // Verify placement percentages add up correctly (User1: 1st, 2nd, 3rd, 4th = 25% each)
            const totalPlacementPercentage =
                response.body.percentageFirstPlace +
                response.body.percentageSecondPlace +
                response.body.percentageThirdPlace +
                response.body.percentageFourthPlace;
            expect(totalPlacementPercentage).toBeCloseTo(100, 1);

            // Points stats
            expect(response.body).toHaveProperty('sumOfPoints');
            expect(response.body).toHaveProperty('maxPoints');
            expect(response.body).toHaveProperty('minPoints');
            expect(response.body).toHaveProperty('averagePoints');

            // Rating stats
            expect(response.body).toHaveProperty('averageIncrement');
            expect(response.body).toHaveProperty('amountOfRatingEarned');
            expect(response.body).toHaveProperty('averagePlace');

            // Negative rank percentage
            expect(response.body).toHaveProperty('percentageOfNegativeRank');
            expect(response.body.percentageOfNegativeRank).toBe(25); // 1 out of 4 games

            // Participation percentage
            expect(response.body).toHaveProperty('percentageOfGamesPlayedFromAll');
            expect(response.body.percentageOfGamesPlayedFromAll).toBeGreaterThan(0);
        });

        test('should calculate correct placement percentages', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/${testUser1Id}/stats`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);

            // User1 played 4 games: 1st, 2nd, 3rd, 4th = 25% each
            expect(response.body.percentageFirstPlace).toBe(25);
            expect(response.body.percentageSecondPlace).toBe(25);
            expect(response.body.percentageThirdPlace).toBe(25);
            expect(response.body.percentageFourthPlace).toBe(25);
            expect(response.body.averagePlace).toBe(2.5);
        });

        test('should calculate correct points statistics', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/${testUser1Id}/stats`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);

            // User1 points: 40000, 30000, 20000, -5000
            expect(response.body.maxPoints).toBe(40000);
            expect(response.body.minPoints).toBe(-5000);
            expect(response.body.sumOfPoints).toBe(85000);
            expect(response.body.averagePoints).toBe(21250);
        });

        test('should return default stats for user with no games', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/${testUser5Id}/stats`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(response.body.userId).toBe(testUser5Id);
            expect(response.body.gamesPlayed).toBe(0);
            expect(response.body.playerRating).toBe(1000); // Starting rating
            expect(response.body.sumOfPoints).toBe(0);
            expect(response.body.maxPoints).toBe(0);
            expect(response.body.minPoints).toBe(0);
            expect(response.body.averagePoints).toBe(0);
            expect(response.body.averageIncrement).toBe(0);
            expect(response.body.percentageFirstPlace).toBe(0);
            expect(response.body.percentageOfNegativeRank).toBe(0);
        });

        test('should return 400 for invalid userId', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/invalid/stats`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(400);
        });

        test('should return 400 for invalid eventId', async () => {
            const response = await request(app)
                .get(`/api/events/invalid/users/${testUser1Id}/stats`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(400);
        });

        test('should return 404 for non-existent user', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/99999/stats`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('errorCode');
        });

        test('should return 404 for non-existent event', async () => {
            const response = await request(app)
                .get(`/api/events/99999/users/${testUser1Id}/stats`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('errorCode');
        });

        test('should require authentication', async () => {
            const response = await request(app).get(`/api/events/${TEST_EVENT_ID}/users/${testUser1Id}/stats`);

            expect(response.status).toBe(401);
        });

        test('should verify rating calculations are consistent', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/${testUser1Id}/stats`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);

            // Average increment * games played should approximately equal total rating earned
            const expectedTotal = response.body.averageIncrement * response.body.gamesPlayed;
            expect(response.body.amountOfRatingEarned).toBeCloseTo(expectedTotal, 1);
        });

        test('should calculate participation percentage correctly', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/${testUser1Id}/stats`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);

            // User1 played 4 games out of 4 total games = 100%
            expect(response.body.percentageOfGamesPlayedFromAll).toBe(100);
        });

        test('should return stats for user with partial participation', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/${testUser2Id}/stats`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);

            // User2 played in all 4 games
            expect(response.body.gamesPlayed).toBe(4);
            expect(response.body.percentageOfGamesPlayedFromAll).toBe(100);
        });
    });
});
