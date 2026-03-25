import request from 'supertest';
import express from 'express';
import eventRoutes from '../src/routes/EventRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader, createTestEvent, createCustomEvent, deleteEventById } from './testHelpers.ts';
import { UserService } from '../src/service/UserService.ts';
import { UserRepository } from '../src/repository/UserRepository.ts';

const app = express();
app.use(express.json());
app.use('/api/events', eventRoutes);
app.use(handleErrors);

describe('Event API Endpoints', () => {
    const SYSTEM_USER_ID = 0;
    const TEST_EVENT_ID = 1000; // Test Event created in beforeAll

    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);
    let nonAdminAuthHeader: string;

    beforeAll(async () => {
        // Create test event
        createTestEvent();

        // Create non-admin test user
        const userService = new UserService();
        const userRepository = new UserRepository();
        const user = userService.registerUser('NonAdminEventUser', 'nonadmin_event', 555555555, SYSTEM_USER_ID);
        userRepository.updateUserStatus(user.id, true, 'ACTIVE', SYSTEM_USER_ID);
        nonAdminAuthHeader = createAuthHeader(user.id);
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
            expect(event).toHaveProperty('clubId');
            expect(event).toHaveProperty('isCurrentRating');
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
            expect(event.gameRules).toHaveProperty('clubId');
            expect(event.gameRules).toHaveProperty('numberOfPlayers');
            expect(event.gameRules).toHaveProperty('uma');
            expect(Array.isArray(event.gameRules.uma)).toBe(true);
            expect(event.gameRules).toHaveProperty('startingPoints');
            expect(event.gameRules).toHaveProperty('startingRating');
        });

        test('should filter events by clubId including global events', async () => {
            const clubScopedEventId = 2101;
            const globalEventId = 2102;
            const otherClubEventId = 2103;
            const otherClubId = 2;
            const timestamp = '2024-01-01T00:00:00.000Z';

            dbManager.db.prepare(
                `INSERT INTO club (id, name, address, city, description, contactInfo, isActive, ratingChatId, ratingTopicId, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(otherClubId, 'Test Club 2', null, null, null, null, 1, null, null, timestamp, timestamp, 0);

            createCustomEvent(clubScopedEventId, 'Club Event', undefined, undefined, 1, 1);
            createCustomEvent(globalEventId, 'Global Event', undefined, undefined, 1, null);
            createCustomEvent(otherClubEventId, 'Other Club Event', undefined, undefined, 1, otherClubId);

            const response = await request(app)
                .get('/api/events?clubId=1')
                .set('Authorization', adminAuthHeader);

            deleteEventById(clubScopedEventId);
            deleteEventById(globalEventId);
            deleteEventById(otherClubEventId);
            dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(otherClubId);

            expect(response.status).toBe(200);
            expect(response.body.some((event: { id: number }) => event.id === clubScopedEventId)).toBe(true);
            expect(response.body.some((event: { id: number }) => event.id === globalEventId)).toBe(true);
            expect(response.body.some((event: { id: number }) => event.id === otherClubEventId)).toBe(false);
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
            expect(response.body).toHaveProperty('isCurrentRating');
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
            expect(response.body.clubId === null || typeof response.body.clubId === 'number').toBe(true);
            expect(typeof response.body.isCurrentRating).toBe('boolean');
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
            expect(gameRules).toHaveProperty('clubId');
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

    describe('POST /api/events - Create Event (admin only)', () => {
        const createPayload = {
            name: 'Integration Created Event',
            description: 'Created via tests',
            type: 'SEASON',
            gameRulesId: 1,
            dateFrom: '2026-01-01T00:00:00.000Z',
            dateTo: '2026-01-31T00:00:00.000Z'
        };

        let createdEventId: number | undefined;

        afterEach(() => {
            if (createdEventId) {
                deleteEventById(createdEventId);
                createdEventId = undefined;
            }
        });

        test('should create an event when admin and payload valid', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send(createPayload);

            createdEventId = response.body.id;

            expect(response.status).toBe(201);
            expect(typeof response.body.id).toBe('number');
            expect(response.body.name).toBe(createPayload.name);
            expect(response.body.type).toBe(createPayload.type);
            expect(response.body.gameRules.id).toBe(createPayload.gameRulesId);
            expect(response.body.clubId).toBeNull();
            expect(response.body.isCurrentRating).toBe(false);
        });

        test('should create current rating season for club when no other current season exists', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...createPayload, clubId: 1, isCurrentRating: true });

            createdEventId = response.body.id;

            expect(response.status).toBe(201);
            expect(response.body.clubId).toBe(1);
            expect(response.body.isCurrentRating).toBe(true);
        });

        test('should reject current rating event without clubId', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...createPayload, isCurrentRating: true });

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('currentRatingEventMustBeClubScoped');
        });

        test('should reject current rating event for tournament', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...createPayload, clubId: 1, type: 'TOURNAMENT', isCurrentRating: true });

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('currentRatingEventMustBeSeason');
        });

        test('should replace previous current rating season in same club on create', async () => {
            createCustomEvent(2104, 'Existing Current Season', undefined, undefined, 1, 1);
            dbManager.db.prepare('UPDATE club SET currentRatingEventId = ? WHERE id = ?').run(2104, 1);

            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...createPayload, clubId: 1, isCurrentRating: true });

            createdEventId = response.body.id;

            const currentRatingEventId = dbManager.db.prepare('SELECT currentRatingEventId FROM club WHERE id = ?').get(1) as { currentRatingEventId: number | null };

            deleteEventById(2104);

            expect(response.status).toBe(201);
            expect(response.body.isCurrentRating).toBe(true);
            expect(currentRatingEventId.currentRatingEventId).toBe(response.body.id);
        });

        test('should reject when not authenticated', async () => {
            const response = await request(app).post('/api/events').send(createPayload);
            expect(response.status).toBe(401);
        });

        test('should reject when not admin', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', nonAdminAuthHeader)
                .send(createPayload);
            expect(response.status).toBe(403);
        });

        test('should validate body and return 400 for invalid payload', async () => {
            const invalidPayload = { ...createPayload, type: 'INVALID' } as any;
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send(invalidPayload);
            expect(response.status).toBe(400);
        });

        test('should return 404 when gameRules does not exist', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...createPayload, gameRulesId: 99999 });
            expect(response.status).toBe(404);
        });

        test('should return 404 when club does not exist', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...createPayload, clubId: 99999 });
            expect(response.status).toBe(404);
        });
    });

    describe('PUT /api/events/:eventId - Update Event (admin only)', () => {
        const baseEventId = 2001;
        const updatePayload = {
            name: 'Updated Name',
            description: null,
            type: 'TOURNAMENT',
            clubId: 1,
            gameRulesId: 1,
            dateFrom: '2026-04-01T00:00:00.000Z',
            dateTo: '2026-05-01T00:00:00.000Z'
        };

        beforeEach(() => {
            createCustomEvent(baseEventId, 'Event To Update', '2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z');
        });

        afterEach(() => {
            deleteEventById(baseEventId);
        });

        test('should update event with full body', async () => {
            const response = await request(app)
                .put(`/api/events/${baseEventId}`)
                .set('Authorization', adminAuthHeader)
                .send(updatePayload);

            expect(response.status).toBe(200);
            expect(response.body.name).toBe(updatePayload.name);
            expect(response.body.type).toBe(updatePayload.type);
            expect(response.body.description).toBeNull();
            expect(response.body.gameRules.id).toBe(updatePayload.gameRulesId);
            expect(response.body.clubId).toBe(updatePayload.clubId);
            expect(response.body.isCurrentRating).toBe(false);
        });

        test('should update event to current rating season when club has no other one', async () => {
            const response = await request(app)
                .put(`/api/events/${baseEventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ ...updatePayload, type: 'SEASON', isCurrentRating: true });

            expect(response.status).toBe(200);
            expect(response.body.isCurrentRating).toBe(true);
        });

        test('should replace previous current rating season in same club on update', async () => {
            createCustomEvent(2105, 'Existing Current Season', undefined, undefined, 1, 1);
            dbManager.db.prepare('UPDATE club SET currentRatingEventId = ? WHERE id = ?').run(2105, 1);

            const response = await request(app)
                .put(`/api/events/${baseEventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ ...updatePayload, type: 'SEASON', isCurrentRating: true });

            const currentRatingEventId = dbManager.db.prepare('SELECT currentRatingEventId FROM club WHERE id = ?').get(1) as { currentRatingEventId: number | null };

            deleteEventById(2105);

            expect(response.status).toBe(200);
            expect(response.body.isCurrentRating).toBe(true);
            expect(currentRatingEventId.currentRatingEventId).toBe(baseEventId);
        });

        test('should reject when not authenticated', async () => {
            const response = await request(app)
                .put(`/api/events/${baseEventId}`)
                .send(updatePayload);
            expect(response.status).toBe(401);
        });

        test('should reject when not admin', async () => {
            const response = await request(app)
                .put(`/api/events/${baseEventId}`)
                .set('Authorization', nonAdminAuthHeader)
                .send(updatePayload);
            expect(response.status).toBe(403);
        });

        test('should return 404 for missing event', async () => {
            const response = await request(app)
                .put('/api/events/99999')
                .set('Authorization', adminAuthHeader)
                .send(updatePayload);
            expect(response.status).toBe(404);
        });

        test('should return 400 for invalid body', async () => {
            const response = await request(app)
                .put(`/api/events/${baseEventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ name: 'Missing required fields' });
            expect(response.status).toBe(400);
        });

        test('should return 404 when club does not exist', async () => {
            const response = await request(app)
                .put(`/api/events/${baseEventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ ...updatePayload, clubId: 99999 });
            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /api/events/:eventId - Delete Event (admin only)', () => {
        const deletableEventId = 2002;

        beforeEach(() => {
            createCustomEvent(deletableEventId, 'Event To Delete');
        });

        afterEach(() => {
            // Ensure cleanup if delete failed
            deleteEventById(deletableEventId);
        });

        test('should delete event and return 204', async () => {
            const response = await request(app)
                .delete(`/api/events/${deletableEventId}`)
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(204);

            const fetchResponse = await request(app)
                .get(`/api/events/${deletableEventId}`)
                .set('Authorization', adminAuthHeader);
            expect(fetchResponse.status).toBe(404);
        });

        test('should reject when not authenticated', async () => {
            const response = await request(app).delete(`/api/events/${deletableEventId}`);
            expect(response.status).toBe(401);
        });

        test('should reject when not admin', async () => {
            const response = await request(app)
                .delete(`/api/events/${deletableEventId}`)
                .set('Authorization', nonAdminAuthHeader);
            expect(response.status).toBe(403);
        });

        test('should return 404 for missing event', async () => {
            const response = await request(app)
                .delete('/api/events/99999')
                .set('Authorization', adminAuthHeader);
            expect(response.status).toBe(404);
        });
    });
});
