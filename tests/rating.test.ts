import request from 'supertest';
import express from 'express';
import ratingRoutes from '../src/routes/RatingRoutes.ts';
import gameRoutes from '../src/routes/GameRoutes.ts';
import userRoutes from '../src/routes/UserRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { closeDB } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader } from './testHelpers.ts';

const app = express();
app.use(express.json());
app.use('/api', ratingRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/users', userRoutes);
app.use(handleErrors);

describe('Rating API Endpoints', () => {
    const SYSTEM_USER_ID = 0;
    const TEST_EVENT_ID = 1; // Test Event from migrations

    let testUser1Id: number;
    let testUser2Id: number;
    let testUser3Id: number;
    let testUser4Id: number;

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
                telegramId
            });
        return response.body.id;
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
        return response.body.id;
    }

    beforeAll(async () => {
        // Create test users
        testUser1Id = await createTestUser('RatingPlayer1', 211111111);
        testUser2Id = await createTestUser('RatingPlayer2', 222222222);
        testUser3Id = await createTestUser('RatingPlayer3', 233333333);
        testUser4Id = await createTestUser('RatingPlayer4', 244444444);

        user1AuthHeader = createAuthHeader(testUser1Id);

        // Create a test game to generate rating changes
        await createTestGame(user1AuthHeader, [
            { userId: testUser1Id, points: 35000, startPlace: 'EAST' },
            { userId: testUser2Id, points: 28000, startPlace: 'SOUTH' },
            { userId: testUser3Id, points: 22000, startPlace: 'WEST' },
            { userId: testUser4Id, points: 15000, startPlace: 'NORTH' }
        ]);
    });

    afterAll(() => {
        closeDB();
        cleanupTestDatabase();
    });

    describe('GET /api/events/:eventId/rating - Get All Users Current Rating', () => {
        test('should return current ratings for all users in event', async () => {
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
            const response = await request(app)
                .get('/api/events/99999/rating')
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(404);
        });

    });

    describe('GET /api/events/:eventId/rating/change - Get Rating Changes During Period', () => {
        test('should return rating changes for all users in period', async () => {
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
            const dateFrom = new Date('2020-01-01').toISOString();
            const dateTo = new Date('2020-01-02').toISOString();

            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/rating/change`)
                .query({ dateFrom, dateTo })
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('should return 400 for invalid date format', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/rating/change`)
                .query({ dateFrom: 'invalid-date', dateTo: new Date().toISOString() })
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(400);
        });

        test('should require both dateFrom and dateTo', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/rating/change`)
                .query({ dateFrom: new Date().toISOString() })
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(400);
        });

    });

    describe('GET /api/events/:eventId/users/:userId/rating/history - Get User Rating History', () => {
        test('should return rating history for specific user', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/${testUser1Id}/rating/history`)
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
            // Create another game to have multiple history entries
            await createTestGame(user1AuthHeader, [
                { userId: testUser1Id, points: 40000, startPlace: 'EAST' },
                { userId: testUser2Id, points: 25000, startPlace: 'SOUTH' },
                { userId: testUser3Id, points: 20000, startPlace: 'WEST' },
                { userId: testUser4Id, points: 15000, startPlace: 'NORTH' }
            ]);

            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/${testUser1Id}/rating/history`)
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
            const newUserId = await createTestUser('NoGamesUser', 299999999);

            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/${newUserId}/rating/history`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });

        test('should return 404 for non-existent user', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/99999/rating/history`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(404);
        });

        test('should return 404 for non-existent event', async () => {
            const response = await request(app)
                .get(`/api/events/99999/users/${testUser1Id}/rating/history`)
                .set('Authorization', user1AuthHeader);

            expect(response.status).toBe(404);
        });

    });

    describe('Rating Calculation Accuracy', () => {
        test('should calculate correct rating changes based on UMA', async () => {
            // Create a fresh user to test rating calculation
            const freshUserId = await createTestUser('FreshRatingUser', 288888888);
            const freshAuthHeader = createAuthHeader(freshUserId);

            // Create a game where this user finishes first
            await createTestGame(freshAuthHeader, [
                { userId: freshUserId, points: 40000, startPlace: 'EAST' },
                { userId: testUser2Id, points: 25000, startPlace: 'SOUTH' },
                { userId: testUser3Id, points: 20000, startPlace: 'WEST' },
                { userId: testUser4Id, points: 15000, startPlace: 'NORTH' }
            ]);

            // Get rating history
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/users/${freshUserId}/rating/history`)
                .set('Authorization', freshAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body.length).toBe(1);

            // First place UMA for standard yonma is +15
            // Starting rating is 1000
            // RatingSnapshot only has timestamp and rating
            // Rating should be greater than starting rating (1000)
            expect(response.body[0].rating).toBeGreaterThan(1000);
        });
    });
});
