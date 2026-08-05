import request from 'supertest';
import express from 'express';
import eventRoutes from '../src/routes/EventRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader } from './testHelpers.ts';
import { UserService } from '../src/service/UserService.ts';
import { UserRepository } from '../src/repository/UserRepository.ts';

const app = express();
app.use(express.json());
app.use('/api/events', eventRoutes);
app.use(handleErrors);

describe('Event Category Endpoints', () => {
    const SYSTEM_USER_ID = 0;
    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);
    let nonAdminAuthHeader: string;

    beforeAll(() => {
        const userService = new UserService();
        const userRepository = new UserRepository();
        const user = userService.registerUser('CategoryTestUser', 'cat_test_user', 777777777, SYSTEM_USER_ID);
        userRepository.updateUserStatus(user.id, true, 'ACTIVE', SYSTEM_USER_ID);
        nonAdminAuthHeader = createAuthHeader(user.id);
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    test('GET /api/events/categories should return seeded categories', async () => {
        const response = await request(app)
            .get('/api/events/categories')
            .set('Authorization', adminAuthHeader);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);

        const categories = response.body.map((c: { category: string }) => c.category);
        expect(categories).toEqual(['CLUB_TOURNAMENT', 'EMA', 'FRIENDLY', 'LEAGUE']);
    });

    test('POST /api/events should allow setting a valid category', async () => {
        const response = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'EMA Tournament 2026',
                type: 'TOURNAMENT',
                category: 'EMA',
                gameRulesId: 1,
                clubId: 1,
                tournament: {
                    totalRounds: 4,
                },
            });

        expect(response.status).toBe(201);
        expect(response.body.category).toBe('EMA');
    });

    test('POST /api/events should reject an unknown category with 400', async () => {
        const response = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Unknown Category Event',
                type: 'SEASON',
                category: 'INVALID_CATEGORY',
                gameRulesId: 1,
                clubId: 1,
            });

        expect(response.status).toBe(400);
        expect(response.body.errorCode).toBe('unknownEventCategory');
    });

    test('PUT /api/events/:eventId should allow updating category', async () => {
        const createRes = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Club League 2026',
                type: 'SEASON',
                category: 'FRIENDLY',
                gameRulesId: 1,
                clubId: 1,
            });

        expect(createRes.status).toBe(201);
        const eventId = createRes.body.id;

        const updateRes = await request(app)
            .put(`/api/events/${eventId}`)
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Club League 2026',
                type: 'SEASON',
                category: 'LEAGUE',
                gameRulesId: 1,
                clubId: 1,
            });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.category).toBe('LEAGUE');
    });

    test('POST /api/events should reject non-moderator/non-owner with 403', async () => {
        const response = await request(app)
            .post('/api/events')
            .set('Authorization', nonAdminAuthHeader)
            .send({
                name: 'Unauthorized Event',
                type: 'SEASON',
                category: 'LEAGUE',
                gameRulesId: 1,
                clubId: 1,
            });

        expect(response.status).toBe(403);
    });
});
