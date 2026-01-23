import request from 'supertest';
import express from 'express';
import eventRoutes from '../src/routes/EventRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader, createTestEvent } from './testHelpers.ts';

const app = express();
app.use(express.json());
app.use('/api/events', eventRoutes);
app.use(handleErrors);

describe('Event API Endpoints', () => {
    const SYSTEM_USER_ID = 0;
    const TEST_EVENT_ID = 1000; // Test Event created in beforeAll

    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);

    beforeAll(async () => {
        // Create test event
        createTestEvent();
    });

    afterAll(() => {
        dbManager.closeDB();
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
            expect(event).toHaveProperty('gameCount');
            expect(event).toHaveProperty('createdAt');
            expect(event).toHaveProperty('modifiedAt');
            expect(event).toHaveProperty('modifiedBy');

            // Verify gameRules is an object with the correct structure
            expect(typeof event.gameRules).toBe('object');
            expect(event.gameRules).toHaveProperty('id');
            expect(event.gameRules).toHaveProperty('name');
            expect(event.gameRules).toHaveProperty('numberOfPlayers');
            expect(event.gameRules).toHaveProperty('uma');
            expect(Array.isArray(event.gameRules.uma)).toBe(true);
            expect(event.gameRules).toHaveProperty('startingPoints');
            expect(event.gameRules).toHaveProperty('startingRating');
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
            expect(typeof response.body.gameRules).toBe('object');
            expect(response.body.dateFrom === null || typeof response.body.dateFrom === 'string').toBe(true);
            expect(response.body.dateTo === null || typeof response.body.dateTo === 'string').toBe(true);
            expect(typeof response.body.gameCount).toBe('number');
            expect(typeof response.body.createdAt).toBe('string');
            expect(typeof response.body.modifiedAt).toBe('string');
            expect(typeof response.body.modifiedBy).toBe('number');
        });

        test('should include game rules in event response', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}`)
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);

            const gameRules = response.body.gameRules;
            expect(gameRules).toHaveProperty('id');
            expect(gameRules).toHaveProperty('name');
            expect(gameRules).toHaveProperty('numberOfPlayers');
            expect(gameRules).toHaveProperty('uma');
            expect(gameRules).toHaveProperty('startingPoints');
            expect(gameRules).toHaveProperty('startingRating');

            expect(typeof gameRules.id).toBe('number');
            expect(typeof gameRules.name).toBe('string');
            expect(typeof gameRules.numberOfPlayers).toBe('number');
            expect(Array.isArray(gameRules.uma)).toBe(true);
            expect(typeof gameRules.startingPoints).toBe('number');
            expect(typeof gameRules.startingRating).toBe('number');
        });

        test('should parse uma as 2D array of numbers in game rules', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}`)
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);
            const uma = response.body.gameRules.uma;
            expect(Array.isArray(uma)).toBe(true);
            expect(uma.length).toBe(3);
            uma.forEach((value: any) => {
                expect(Array.isArray(value)).toBe(true);
                value.forEach((num: any) => {
                    expect(typeof num).toBe('number');
                });
            });
        });

        test('should return gameCount field with correct value', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}`)
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('gameCount');
            expect(typeof response.body.gameCount).toBe('number');
            expect(response.body.gameCount).toBeGreaterThanOrEqual(0);
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

        test('should return 400 for invalid eventId', async () => {
            const response = await request(app).get('/api/events/invalid').set('Authorization', adminAuthHeader);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
            expect(response.body).toHaveProperty('details');
        });
    });
});
