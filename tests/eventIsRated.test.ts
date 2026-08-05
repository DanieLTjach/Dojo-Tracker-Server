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

describe('Event isRated Flag Endpoints', () => {
    const SYSTEM_USER_ID = 0;
    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);
    let nonAdminAuthHeader: string;

    beforeAll(() => {
        const userService = new UserService();
        const userRepository = new UserRepository();
        const user = userService.registerUser('IsRatedTestUser', 'israted_test_user', 888888888, SYSTEM_USER_ID);
        userRepository.updateUserStatus(user.id, true, 'ACTIVE', SYSTEM_USER_ID);
        nonAdminAuthHeader = createAuthHeader(user.id);
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    test('POST /api/events should default isRated to true', async () => {
        const response = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Default Rated Event',
                type: 'SEASON',
                gameRulesId: 1,
                clubId: 1,
            });

        expect(response.status).toBe(201);
        expect(response.body.isRated).toBe(true);
    });

    test('POST /api/events should allow setting isRated to false', async () => {
        const response = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Non Rated Event',
                type: 'SEASON',
                isRated: false,
                gameRulesId: 1,
                clubId: 1,
            });

        expect(response.status).toBe(201);
        expect(response.body.isRated).toBe(false);
    });

    test('PUT /api/events/:eventId should allow toggling isRated', async () => {
        const createRes = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Toggle Rated Event',
                type: 'SEASON',
                isRated: true,
                gameRulesId: 1,
                clubId: 1,
            });

        expect(createRes.status).toBe(201);
        const eventId = createRes.body.id;

        const updateRes = await request(app)
            .put(`/api/events/${eventId}`)
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Toggle Rated Event',
                type: 'SEASON',
                isRated: false,
                gameRulesId: 1,
                clubId: 1,
            });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.isRated).toBe(false);
    });

    test('PUT /api/events/:eventId should reject un-rating the club active current rating season with 409', async () => {
        const createRes = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Active Rating Season',
                type: 'SEASON',
                isCurrentRating: true,
                isRated: true,
                gameRulesId: 1,
                clubId: 1,
            });

        expect(createRes.status).toBe(201);
        const eventId = createRes.body.id;

        const unrateRes = await request(app)
            .put(`/api/events/${eventId}`)
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Active Rating Season',
                type: 'SEASON',
                isCurrentRating: true,
                isRated: false,
                gameRulesId: 1,
                clubId: 1,
            });

        expect(unrateRes.status).toBe(409);
        expect(unrateRes.body.errorCode).toBe('cannotUnrateCurrentSeason');
    });

    test('PATCH /api/events/:eventId should allow updating isRated partially', async () => {
        const createRes = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Patch Rated Event',
                type: 'SEASON',
                isRated: true,
                gameRulesId: 1,
                clubId: 1,
            });

        expect(createRes.status).toBe(201);
        const eventId = createRes.body.id;

        const patchRes = await request(app)
            .patch(`/api/events/${eventId}`)
            .set('Authorization', adminAuthHeader)
            .send({
                isRated: false,
            });

        expect(patchRes.status).toBe(200);
        expect(patchRes.body.isRated).toBe(false);
    });

    test('PUT /api/events/:eventId should preserve isRated=false when the body omits it', async () => {
        const createRes = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Omitted IsRated Event',
                type: 'SEASON',
                isRated: false,
                gameRulesId: 1,
                clubId: 1,
            });

        expect(createRes.status).toBe(201);
        expect(createRes.body.isRated).toBe(false);

        const updateRes = await request(app)
            .put(`/api/events/${createRes.body.id}`)
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Omitted IsRated Event Renamed',
                type: 'SEASON',
                gameRulesId: 1,
                clubId: 1,
            });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.isRated).toBe(false);
    });

    test('PATCH /api/events/:eventId should preserve isRated=false when patching another field', async () => {
        const createRes = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Patch Unrelated Field Event',
                type: 'SEASON',
                isRated: false,
                gameRulesId: 1,
                clubId: 1,
            });

        expect(createRes.status).toBe(201);

        const patchRes = await request(app)
            .patch(`/api/events/${createRes.body.id}`)
            .set('Authorization', adminAuthHeader)
            .send({ description: 'unrelated change' });

        expect(patchRes.status).toBe(200);
        expect(patchRes.body.isRated).toBe(false);
    });

    test('PUT /api/events/:eventId should preserve category when the body omits it', async () => {
        const createRes = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Omitted Category Event',
                type: 'SEASON',
                category: 'EMA',
                gameRulesId: 1,
                clubId: 1,
            });

        expect(createRes.status).toBe(201);
        expect(createRes.body.category).toBe('EMA');

        const updateRes = await request(app)
            .put(`/api/events/${createRes.body.id}`)
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Omitted Category Event Renamed',
                type: 'SEASON',
                gameRulesId: 1,
                clubId: 1,
            });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.category).toBe('EMA');
    });

    test('PUT /api/events/:eventId should reject non-moderator/non-owner with 403', async () => {
        const response = await request(app)
            .put('/api/events/1')
            .set('Authorization', nonAdminAuthHeader)
            .send({
                name: 'Unauthorized Edit Event',
                type: 'SEASON',
                isRated: false,
                gameRulesId: 1,
                clubId: 1,
            });

        expect(response.status).toBe(403);
    });
});
