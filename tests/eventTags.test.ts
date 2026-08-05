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

describe('Event Tag Endpoints', () => {
    const SYSTEM_USER_ID = 0;
    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);
    let nonAdminAuthHeader: string;

    beforeAll(() => {
        const userService = new UserService();
        const userRepository = new UserRepository();
        const user = userService.registerUser('TagTestUser', 'tag_test_user', 777777777, SYSTEM_USER_ID);
        userRepository.updateUserStatus(user.id, true, 'ACTIVE', SYSTEM_USER_ID);
        nonAdminAuthHeader = createAuthHeader(user.id);
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    test('GET /api/events/tags should return seeded tags', async () => {
        const response = await request(app)
            .get('/api/events/tags')
            .set('Authorization', adminAuthHeader);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);

        const tags = response.body.map((t: { tag: string }) => t.tag);
        expect(tags).toEqual(['CLUB_TOURNAMENT', 'EMA', 'FRIENDLY', 'LEAGUE', 'ONLINE']);
    });

    test('POST /api/events should allow setting a single tag', async () => {
        const response = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'EMA Tournament 2026',
                type: 'TOURNAMENT',
                tags: ['EMA'],
                gameRulesId: 1,
                clubId: 1,
                tournament: {
                    totalRounds: 4,
                },
            });

        expect(response.status).toBe(201);
        expect(response.body.tags).toEqual(['EMA']);
    });

    test('POST /api/events should allow multiple tags on one event', async () => {
        const response = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Online EMA Tournament 2026',
                type: 'TOURNAMENT',
                tags: ['ONLINE', 'EMA'],
                gameRulesId: 1,
                clubId: 1,
                tournament: {
                    totalRounds: 4,
                },
            });

        expect(response.status).toBe(201);
        expect(response.body.tags).toEqual(['EMA', 'ONLINE']);
    });

    test('POST /api/events should default to an empty tag list', async () => {
        const response = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Untagged Event',
                type: 'SEASON',
                gameRulesId: 1,
                clubId: 1,
            });

        expect(response.status).toBe(201);
        expect(response.body.tags).toEqual([]);
    });

    test('POST /api/events should reject an unknown tag with 400', async () => {
        const response = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Unknown Tag Event',
                type: 'SEASON',
                tags: ['INVALID_TAG'],
                gameRulesId: 1,
                clubId: 1,
            });

        expect(response.status).toBe(400);
        expect(response.body.errorCode).toBe('unknownEventTag');
    });

    test('POST /api/events should reject a valid tag mixed with an unknown one', async () => {
        const response = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Partially Valid Tags Event',
                type: 'SEASON',
                tags: ['EMA', 'NOPE'],
                gameRulesId: 1,
                clubId: 1,
            });

        expect(response.status).toBe(400);
        expect(response.body.errorCode).toBe('unknownEventTag');
    });

    test('PUT /api/events/:eventId should replace the tag set', async () => {
        const createRes = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Club League 2026',
                type: 'SEASON',
                tags: ['FRIENDLY'],
                gameRulesId: 1,
                clubId: 1,
            });

        expect(createRes.status).toBe(201);

        const updateRes = await request(app)
            .put(`/api/events/${createRes.body.id}`)
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Club League 2026',
                type: 'SEASON',
                tags: ['LEAGUE', 'CLUB_TOURNAMENT'],
                gameRulesId: 1,
                clubId: 1,
            });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.tags).toEqual(['CLUB_TOURNAMENT', 'LEAGUE']);
    });

    test('PUT /api/events/:eventId should preserve tags when the body omits them', async () => {
        const createRes = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Omitted Tags Event',
                type: 'SEASON',
                tags: ['EMA'],
                gameRulesId: 1,
                clubId: 1,
            });

        expect(createRes.status).toBe(201);

        const updateRes = await request(app)
            .put(`/api/events/${createRes.body.id}`)
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Omitted Tags Event Renamed',
                type: 'SEASON',
                gameRulesId: 1,
                clubId: 1,
            });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.tags).toEqual(['EMA']);
    });

    test('PUT /api/events/:eventId should clear tags when given an empty array', async () => {
        const createRes = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Cleared Tags Event',
                type: 'SEASON',
                tags: ['EMA', 'ONLINE'],
                gameRulesId: 1,
                clubId: 1,
            });

        expect(createRes.status).toBe(201);
        expect(createRes.body.tags).toEqual(['EMA', 'ONLINE']);

        const updateRes = await request(app)
            .put(`/api/events/${createRes.body.id}`)
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Cleared Tags Event',
                type: 'SEASON',
                tags: [],
                gameRulesId: 1,
                clubId: 1,
            });

        expect(updateRes.status).toBe(200);
        expect(updateRes.body.tags).toEqual([]);
    });

    test('PATCH /api/events/:eventId should update tags partially', async () => {
        const createRes = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Patch Tags Event',
                type: 'SEASON',
                tags: ['FRIENDLY'],
                gameRulesId: 1,
                clubId: 1,
            });

        expect(createRes.status).toBe(201);

        const patchRes = await request(app)
            .patch(`/api/events/${createRes.body.id}`)
            .set('Authorization', adminAuthHeader)
            .send({ tags: ['LEAGUE'] });

        expect(patchRes.status).toBe(200);
        expect(patchRes.body.tags).toEqual(['LEAGUE']);
    });

    test('GET /api/events/:eventId should return tags on the event', async () => {
        const createRes = await request(app)
            .post('/api/events')
            .set('Authorization', adminAuthHeader)
            .send({
                name: 'Readback Tags Event',
                type: 'SEASON',
                tags: ['ONLINE', 'LEAGUE'],
                gameRulesId: 1,
                clubId: 1,
            });

        expect(createRes.status).toBe(201);

        const getRes = await request(app)
            .get(`/api/events/${createRes.body.id}`)
            .set('Authorization', adminAuthHeader);

        expect(getRes.status).toBe(200);
        expect(getRes.body.tags).toEqual(['LEAGUE', 'ONLINE']);
    });

    test('POST /api/events should reject non-moderator/non-owner with 403', async () => {
        const response = await request(app)
            .post('/api/events')
            .set('Authorization', nonAdminAuthHeader)
            .send({
                name: 'Unauthorized Event',
                type: 'SEASON',
                tags: ['LEAGUE'],
                gameRulesId: 1,
                clubId: 1,
            });

        expect(response.status).toBe(403);
    });
});
