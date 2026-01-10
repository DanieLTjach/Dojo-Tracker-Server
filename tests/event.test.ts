import request from 'supertest';
import express from 'express';
import eventRoutes from '../src/routes/EventRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { closeDB } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader } from './testHelpers.ts';

const app = express();
app.use(express.json());
app.use('/api/events', eventRoutes);
app.use(handleErrors);

describe('Event API Endpoints', () => {
    const SYSTEM_USER_ID = 0;
    const ADMIN_TELEGRAM_ID = 123456789;
    const TEST_EVENT_ID = 1; // Test Event from migrations

    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID, ADMIN_TELEGRAM_ID, true, true);

    afterAll(() => {
        closeDB();
        cleanupTestDatabase();
    });

    describe('GET /api/events - Get All Events', () => {
        test('should return array of all events', async () => {
            const response = await request(app).get('/api/events').set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
        });

        test('should return events with correct structure', async () => {
            const response = await request(app).get('/api/events').set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);
            const event = response.body[0];

            expect(event).toHaveProperty('id');
            expect(event).toHaveProperty('name');
            expect(event).toHaveProperty('description');
            expect(event).toHaveProperty('type');
            expect(event).toHaveProperty('gameRules');
            expect(event).toHaveProperty('dateFrom');
            expect(event).toHaveProperty('dateTo');
            expect(event).toHaveProperty('createdAt');
            expect(event).toHaveProperty('modifiedAt');
            expect(event).toHaveProperty('modifiedBy');
        });

        test('should return events ordered by createdAt DESC', async () => {
            const response = await request(app).get('/api/events').set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body.length).toBeGreaterThan(0);

            // Verify events are sorted by createdAt descending
            for (let i = 1; i < response.body.length; i++) {
                const prevDate = new Date(response.body[i - 1].createdAt);
                const currDate = new Date(response.body[i].createdAt);
                expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
            }
        });

        test('should require authentication', async () => {
            const response = await request(app).get('/api/events');

            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/events/:eventId - Get Event by ID', () => {
        test('should return single event by ID', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}`)
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id', TEST_EVENT_ID);
            expect(response.body).toHaveProperty('name');
            expect(response.body).toHaveProperty('description');
            expect(response.body).toHaveProperty('type');
            expect(response.body).toHaveProperty('gameRules');
        });

        test('should return event with all required fields', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}`)
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);

            expect(typeof response.body.id).toBe('number');
            expect(response.body.name === null || typeof response.body.name === 'string').toBe(true);
            expect(response.body.description === null || typeof response.body.description === 'string').toBe(true);
            expect(typeof response.body.type).toBe('string');
            expect(typeof response.body.gameRules).toBe('number');
            expect(response.body.dateFrom === null || typeof response.body.dateFrom === 'string').toBe(true);
            expect(response.body.dateTo === null || typeof response.body.dateTo === 'string').toBe(true);
            expect(typeof response.body.createdAt).toBe('string');
            expect(typeof response.body.modifiedAt).toBe('string');
            expect(typeof response.body.modifiedBy).toBe('number');
        });

        test('should return 404 for non-existent event', async () => {
            const response = await request(app).get('/api/events/99999').set('Authorization', adminAuthHeader);

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('errorCode');
        });

        test('should require authentication', async () => {
            const response = await request(app).get(`/api/events/${TEST_EVENT_ID}`);

            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/events/:eventId/game-rules - Get Game Rules by Event ID', () => {
        test('should return game rules for event', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/game-rules`)
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id');
            expect(response.body).toHaveProperty('name');
            expect(response.body).toHaveProperty('numberOfPlayers');
            expect(response.body).toHaveProperty('uma');
            expect(response.body).toHaveProperty('startingPoints');
            expect(response.body).toHaveProperty('startingRating');
        });

        test('should return game rules with correct types', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/game-rules`)
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);

            expect(typeof response.body.id).toBe('number');
            expect(typeof response.body.name).toBe('string');
            expect(typeof response.body.numberOfPlayers).toBe('number');
            expect(Array.isArray(response.body.uma)).toBe(true);
            expect(typeof response.body.startingPoints).toBe('number');
            expect(typeof response.body.startingRating).toBe('number');
        });

        test('should parse uma as array of numbers', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}/game-rules`)
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body.uma)).toBe(true);
            expect(response.body.uma.length).toBe(4);
            response.body.uma.forEach((value: any) => {
                expect(typeof value).toBe('number');
            });
        });

        test('should return 500 for event with no game rules', async () => {
            const response = await request(app).get('/api/events/99999/game-rules').set('Authorization', adminAuthHeader);

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('errorCode');
        });

        test('should require authentication', async () => {
            const response = await request(app).get(`/api/events/${TEST_EVENT_ID}/game-rules`);

            expect(response.status).toBe(401);
        });
    });
});
