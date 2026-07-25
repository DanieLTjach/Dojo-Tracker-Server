import request from 'supertest';
import express from 'express';
import eventRoutes from '../src/routes/EventRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader, createTestEvent, createCustomEvent, deleteEventById } from './testHelpers.ts';
import { UserService } from '../src/service/UserService.ts';
import { UserRepository } from '../src/repository/UserRepository.ts';
import { EventRepository } from '../src/repository/EventRepository.ts';

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
        const user = userService.registerUser(
            'NonAdminEventUser',
            '@nonadmin_event',
            'nonadmin_event',
            555555555,
            SYSTEM_USER_ID
        );
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
            expect(event).toHaveProperty('blockGameCreation');
            expect(typeof event.blockGameCreation).toBe('boolean');
            expect(event).toHaveProperty('tournament');
            expect(event).toHaveProperty('config');
            expect(event).toHaveProperty('resolvedPlayerNameDisplay');
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
            expect(event).toHaveProperty('startingRating');
        });

        test('should filter events by clubId including global events', async () => {
            const clubScopedEventId = 2101;
            const globalEventId = 2102;
            const otherClubEventId = 2103;
            const otherClubId = 2;
            const timestamp = '2024-01-01T00:00:00.000Z';

            dbManager.db.prepare(
                `INSERT INTO club (id, name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(otherClubId, 'Test Club 2', null, null, null, null, 1, timestamp, timestamp, 0);

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
            expect(response.body).toHaveProperty('startingRating');

            expect(typeof gameRules.id).toBe('number');
            expect(typeof gameRules.name).toBe('string');
            expect(typeof gameRules.numberOfPlayers).toBe('number');
            expect(Array.isArray(gameRules.uma)).toBe(true);
            expect(typeof gameRules.startingPoints).toBe('number');
            expect(typeof response.body.startingRating).toBe('number');
        });

        test('should resolve preset-backed game rules details in event response', async () => {
            const response = await request(app)
                .get(`/api/events/${TEST_EVENT_ID}`)
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body.gameRules.details).toMatchObject({
                preset: 'ema_2025',
            });
            expect(response.body.gameRules.details.rules.number_of_players).toBe(4);
            expect(response.body.gameRules.details.rules.open_tanyao).toBe(true);
            expect(response.body.gameRules.details.rules.counted_yakuman).toBe(true);
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
            dateTo: '2026-01-31T00:00:00.000Z',
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
            expect(response.body.blockGameCreation).toBe(false);
            expect(response.body.tournament).toBeNull();
            expect(response.body.config).toBeNull();
            expect(response.body.resolvedPlayerNameDisplay).toBe('NICKNAME');
        });

        test('should accept a description up to 5000 characters', async () => {
            const description = 'a'.repeat(5000);
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...createPayload, description });

            createdEventId = response.body.id;

            expect(response.status).toBe(201);
            expect(response.body.description).toBe(description);
        });

        test('should reject a description longer than 5000 characters', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...createPayload, description: 'a'.repeat(5001) });

            expect(response.status).toBe(400);
        });

        test('should create event with blockGameCreation when requested', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...createPayload, blockGameCreation: true });

            createdEventId = response.body.id;

            expect(response.status).toBe(201);
            expect(response.body.blockGameCreation).toBe(true);
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

        test('should allow current rating event for tournament', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({
                    ...createPayload,
                    clubId: 1,
                    type: 'TOURNAMENT',
                    tournament: { totalRounds: 5 },
                    isCurrentRating: true,
                });

            createdEventId = response.body.id;

            expect(response.status).toBe(201);
            expect(response.body.type).toBe('TOURNAMENT');
            expect(response.body.isCurrentRating).toBe(true);
            expect(response.body.tournament).toMatchObject({
                status: 'CREATED',
                currentRound: null,
                totalRounds: 5,
            });
        });

        test('should reject tournament without tournament config', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...createPayload, clubId: 1, type: 'TOURNAMENT' });

            expect(response.status).toBe(400);
        });

        test('should require totalRounds in tournament config', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...createPayload, clubId: 1, type: 'TOURNAMENT', tournament: {} });

            expect(response.status).toBe(400);
        });

        test('should reject season with tournament config', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...createPayload, tournament: { totalRounds: 3 } });

            expect(response.status).toBe(400);
        });

        test('should persist config and resolve playerNameDisplay override', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...createPayload, config: { playerNameDisplay: 'REAL_NAME' } });

            createdEventId = response.body.id;

            expect(response.status).toBe(201);
            expect(response.body.config).toEqual({ playerNameDisplay: 'REAL_NAME' });
            expect(response.body.resolvedPlayerNameDisplay).toBe('REAL_NAME');
        });

        test('should resolve playerNameDisplay default per type when config unset', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...createPayload, clubId: 1, type: 'TOURNAMENT', tournament: { totalRounds: 3 } });

            createdEventId = response.body.id;

            expect(response.status).toBe(201);
            expect(response.body.config).toBeNull();
            expect(response.body.resolvedPlayerNameDisplay).toBe('REAL_NAME');
        });

        test('should persist tournament minParticipants in config', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({
                    ...createPayload,
                    clubId: 1,
                    type: 'TOURNAMENT',
                    tournament: { totalRounds: 3 },
                    config: {
                        minParticipants: 8,
                        maxParticipants: 16,
                        registrationDeadline: '2026-06-01T18:00:00.000Z',
                    },
                });

            createdEventId = response.body.id;

            expect(response.status).toBe(201);
            expect(response.body.config).toEqual({
                minParticipants: 8,
                maxParticipants: 16,
                registrationDeadline: '2026-06-01T18:00:00.000Z',
            });
            expect(response.body.maxParticipants).toBe(16);
            expect(response.body.registrationDeadline).toBe('2026-06-01T18:00:00.000Z');

            const stored = dbManager.db.prepare('SELECT config FROM event WHERE id = ?')
                .get(createdEventId) as { config: string };
            expect(JSON.parse(stored.config)).toEqual({
                minParticipants: 8,
                maxParticipants: 16,
                registrationDeadline: '2026-06-01T18:00:00.000Z',
            });
            expect(new EventRepository().findEventById(createdEventId!)?.config?.registrationDeadline)
                .toEqual(new Date('2026-06-01T18:00:00.000Z'));
        });

        test('should reject minParticipants for a season event', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...createPayload, config: { minParticipants: 4 } });

            expect(response.status).toBe(400);
        });

        test('should reject minParticipants greater than maxParticipants', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({
                    ...createPayload,
                    clubId: 1,
                    type: 'TOURNAMENT',
                    tournament: { totalRounds: 3 },
                    config: { minParticipants: 8, maxParticipants: 4 },
                });

            expect(response.status).toBe(400);
        });

        test('should reject maxParticipants for a season event', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...createPayload, config: { maxParticipants: 16 } });

            expect(response.status).toBe(400);
        });

        test('should replace previous current rating season in same club on create', async () => {
            createCustomEvent(2104, 'Existing Current Season', undefined, undefined, 1, 1);
            dbManager.db.prepare('UPDATE club SET currentRatingEventId = ? WHERE id = ?').run(2104, 1);

            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...createPayload, clubId: 1, isCurrentRating: true });

            createdEventId = response.body.id;

            const currentRatingEventId = dbManager.db.prepare('SELECT currentRatingEventId FROM club WHERE id = ?').get(
                1
            ) as { currentRatingEventId: number | null };

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

    describe('POST /api/events - team format validation', () => {
        const teamTournamentPayload = {
            name: 'Team Tournament',
            type: 'TOURNAMENT',
            format: 'TEAM',
            gameRulesId: 1,
            clubId: 1,
            tournament: { totalRounds: 4 },
            config: { minParticipants: 16, teamConfig: { teamSize: 4, teamCount: 4 } },
        };

        let createdEventId: number | undefined;
        afterEach(() => {
            if (createdEventId) {
                deleteEventById(createdEventId);
                createdEventId = undefined;
            }
        });

        test('defaults format to INDIVIDUAL when omitted', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ name: 'Plain Season', type: 'SEASON', gameRulesId: 1 });
            createdEventId = response.body.id;
            expect(response.status).toBe(201);
            expect(response.body.format).toBe('INDIVIDUAL');
        });

        test('creates a valid TEAM tournament', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send(teamTournamentPayload);
            createdEventId = response.body.id;
            expect(response.status).toBe(201);
            expect(response.body.format).toBe('TEAM');
            expect(response.body.config.teamConfig).toEqual({ teamSize: 4, teamCount: 4 });
        });

        test('rejects TEAM format for a season', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ name: 'Team Season', type: 'SEASON', format: 'TEAM', gameRulesId: 1, clubId: 1 });
            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('invalidEventFormatForType');
        });

        test('rejects HYBRID format in v1', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ name: 'Hybrid Season', type: 'SEASON', format: 'HYBRID', gameRulesId: 1, clubId: 1 });
            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('invalidEventFormatForType');
        });

        test('rejects TEAM tournament without teamConfig', async () => {
            const { config, ...rest } = teamTournamentPayload;
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...rest, config: { minParticipants: 16 } });
            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('teamConfigRequired');
        });

        test('rejects teamConfig on a non-team tournament', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({
                    name: 'Individual Tournament',
                    type: 'TOURNAMENT',
                    format: 'INDIVIDUAL',
                    gameRulesId: 1,
                    clubId: 1,
                    tournament: { totalRounds: 4 },
                    config: { teamConfig: { teamSize: 4, teamCount: 4 } },
                });
            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('teamConfigOnlyForTeamTournament');
        });

        test('rejects teamCount not divisible by 4', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({
                    ...teamTournamentPayload,
                    config: { minParticipants: 6, teamConfig: { teamSize: 2, teamCount: 3 } },
                });
            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('teamCountNotDivisibleByTableSize');
        });

        test('rejects minParticipants that does not equal teamSize * teamCount', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({
                    ...teamTournamentPayload,
                    config: { minParticipants: 20, teamConfig: { teamSize: 4, teamCount: 4 } },
                });
            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('minParticipantsMustMatchTeamConfig');
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
            dateTo: '2026-05-01T00:00:00.000Z',
            tournament: { totalRounds: 4 },
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
            expect(response.body.blockGameCreation).toBe(false);
            expect(response.body.tournament).toMatchObject({
                status: 'CREATED',
                currentRound: null,
                totalRounds: 4,
            });
        });

        test('should update blockGameCreation flag', async () => {
            const response = await request(app)
                .put(`/api/events/${baseEventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ ...updatePayload, blockGameCreation: true });

            expect(response.status).toBe(200);
            expect(response.body.blockGameCreation).toBe(true);
        });

        test('should update event to current rating season when club has no other one', async () => {
            const response = await request(app)
                .put(`/api/events/${baseEventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ ...updatePayload, type: 'SEASON', tournament: undefined, isCurrentRating: true });

            expect(response.status).toBe(200);
            expect(response.body.isCurrentRating).toBe(true);
        });

        test('should replace previous current rating season in same club on update', async () => {
            createCustomEvent(2105, 'Existing Current Season', undefined, undefined, 1, 1);
            dbManager.db.prepare('UPDATE club SET currentRatingEventId = ? WHERE id = ?').run(2105, 1);

            const response = await request(app)
                .put(`/api/events/${baseEventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ ...updatePayload, type: 'SEASON', tournament: undefined, isCurrentRating: true });

            const currentRatingEventId = dbManager.db.prepare('SELECT currentRatingEventId FROM club WHERE id = ?').get(
                1
            ) as { currentRatingEventId: number | null };

            deleteEventById(2105);

            expect(response.status).toBe(200);
            expect(response.body.isCurrentRating).toBe(true);
            expect(currentRatingEventId.currentRatingEventId).toBe(baseEventId);
        });

        test('should unset current rating season on update', async () => {
            dbManager.db.prepare('UPDATE club SET currentRatingEventId = ? WHERE id = ?').run(baseEventId, 1);

            const response = await request(app)
                .put(`/api/events/${baseEventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ ...updatePayload, type: 'SEASON', tournament: undefined, isCurrentRating: false });

            const club = dbManager.db.prepare('SELECT currentRatingEventId FROM club WHERE id = ?').get(1) as {
                currentRatingEventId: number | null;
            };

            expect(response.status).toBe(200);
            expect(response.body.isCurrentRating).toBe(false);
            expect(club.currentRatingEventId).toBeNull();
        });

        test('should clear old club pointer when current rating event moves to another club', async () => {
            const ts = new Date().toISOString();
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO club (id, name, isActive, createdAt, modifiedAt, modifiedBy)
                 VALUES (2, 'Club 2', 1, ?, ?, 0)`
            ).run(ts, ts);

            // Event starts as current rating of club 1
            dbManager.db.prepare('UPDATE club SET currentRatingEventId = ? WHERE id = ?').run(baseEventId, 1);

            // Move event to club 2, keep isCurrentRating = true
            const response = await request(app)
                .put(`/api/events/${baseEventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ ...updatePayload, clubId: 2, type: 'SEASON', tournament: undefined, isCurrentRating: true });

            const club1 = dbManager.db.prepare('SELECT currentRatingEventId FROM club WHERE id = ?').get(1) as {
                currentRatingEventId: number | null;
            };
            const club2 = dbManager.db.prepare('SELECT currentRatingEventId FROM club WHERE id = ?').get(2) as {
                currentRatingEventId: number | null;
            };

            dbManager.db.prepare('UPDATE club SET currentRatingEventId = NULL WHERE id = ?').run(2);
            dbManager.db.prepare('UPDATE event SET clubId = 1 WHERE id = ?').run(baseEventId);
            dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(2);

            expect(response.status).toBe(200);
            expect(response.body.isCurrentRating).toBe(true);
            expect(club1.currentRatingEventId).toBeNull();
            expect(club2.currentRatingEventId).toBe(baseEventId);
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

    describe('Event info JSON field', () => {
        const basePayload = {
            name: 'Info Event',
            description: 'desc',
            type: 'TOURNAMENT' as const,
            clubId: 1,
            gameRulesId: 1,
            dateFrom: '2026-05-23T00:00:00.000Z',
            dateTo: '2026-05-24T00:00:00.000Z',
            tournament: { totalRounds: 2 },
        };

        const fullInfo = {
            schedule: [
                {
                    date: '2026-05-23T00:00:00.000Z',
                    title: 'Перший день, субота, 23 травня',
                    items: [
                        { time: '10:00', title: 'Початок реєстрації' },
                        { time: '10:30–12:00', title: 'Перший ханчан', kind: 'milestone' },
                    ],
                },
            ],
            venue: {
                name: 'Shogi Dojo',
                address: 'Khreshchatyk 1',
                city: 'Kyiv',
                latitude: 50.45,
                longitude: 30.52,
                mapUrl: 'https://maps.google.com/?q=50.45,30.52',
                contactTelegram: 'shogidojo',
            },
            contacts: { phone: '+380501112233', email: 'info@example.com', telegram: 'organizer' },
            links: {
                site: 'https://example.com',
                registrationForm: 'https://forms.example.com/x',
                googleMaps: 'https://maps.google.com/?q=Kyiv',
            },
        };

        let createdEventId: number | undefined;

        afterEach(() => {
            if (createdEventId !== undefined) {
                deleteEventById(createdEventId);
                createdEventId = undefined;
            }
        });

        test('round-trips full info payload on create + GET', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...basePayload, info: fullInfo });
            createdEventId = response.body.id;

            expect(response.status).toBe(201);
            expect(response.body.info).toEqual(fullInfo);

            const fetched = await request(app)
                .get(`/api/events/${createdEventId}`)
                .set('Authorization', adminAuthHeader);
            expect(fetched.body.info).toEqual(fullInfo);
        });

        test('stores null when info omitted or explicitly null', async () => {
            const omitted = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send(basePayload);
            createdEventId = omitted.body.id;
            expect(omitted.status).toBe(201);
            expect(omitted.body.info).toBeNull();

            deleteEventById(createdEventId!);

            const explicit = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...basePayload, info: null });
            createdEventId = explicit.body.id;
            expect(explicit.status).toBe(201);
            expect(explicit.body.info).toBeNull();
        });

        test('updates info and can clear it back to null', async () => {
            const created = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...basePayload, info: fullInfo });
            createdEventId = created.body.id;

            const updated = await request(app)
                .put(`/api/events/${createdEventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ ...basePayload, info: { contacts: { phone: '+380999998877' } } });
            expect(updated.status).toBe(200);
            expect(updated.body.info).toEqual({ contacts: { phone: '+380999998877' } });

            const cleared = await request(app)
                .put(`/api/events/${createdEventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ ...basePayload, info: null });
            expect(cleared.status).toBe(200);
            expect(cleared.body.info).toBeNull();
        });

        test('rejects the removed pairings field', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...basePayload, info: { pairings: [[[1, 2, 3, 4]]] } });
            expect(response.status).toBe(400);
        });

        test('rejects malformed schedule item (missing time)', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({
                    ...basePayload,
                    info: {
                        schedule: [
                            { date: '2026-05-23T00:00:00.000Z', items: [{ title: 'No time' }] },
                        ],
                    },
                });
            expect(response.status).toBe(400);
        });

        test('rejects invalid URL in links.site', async () => {
            const response = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send({ ...basePayload, info: { links: { site: 'not-a-url' } } });
            expect(response.status).toBe(400);
        });
    });

    describe('PATCH /api/events/:eventId - Partial Update', () => {
        const seedInfo = {
            schedule: [
                { date: '2026-05-23T00:00:00.000Z', title: 'Day 1', items: [{ time: '10:00', title: 'Registration' }] },
            ],
            venue: { name: 'Old Venue', address: 'Old Street 1', city: 'Kyiv' },
            contacts: { phone: '+380501234567', paymentInfo: 'Old payment details' },
            links: { site: 'https://old.example.com' },
        };
        const seedPayload = {
            name: 'Patch Base',
            description: 'original description',
            type: 'TOURNAMENT' as const,
            clubId: 1,
            gameRulesId: 1,
            dateFrom: '2026-05-23T00:00:00.000Z',
            dateTo: '2026-05-24T00:00:00.000Z',
            config: {
                playerNameDisplay: 'REAL_NAME' as const,
                maxParticipants: 32,
                registrationDeadline: '2026-05-20T18:00:00.000Z',
            },
            tournament: { totalRounds: 3 },
            info: seedInfo,
        };

        let eventId: number;

        beforeEach(async () => {
            const created = await request(app)
                .post('/api/events')
                .set('Authorization', adminAuthHeader)
                .send(seedPayload);
            eventId = created.body.id;
        });

        afterEach(() => {
            deleteEventById(eventId);
        });

        test('updates only the provided top-level field, keeping the rest', async () => {
            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ description: 'patched description' });

            expect(response.status).toBe(200);
            expect(response.body.description).toBe('patched description');
            // Untouched fields preserved.
            expect(response.body.name).toBe('Patch Base');
            expect(response.body.maxParticipants).toBe(32);
            expect(response.body.gameRules.id).toBe(1);
            expect(response.body.tournament).toMatchObject({ totalRounds: 3 });
            // info untouched entirely.
            expect(response.body.info).toEqual(seedInfo);
        });

        test('deep-merges config: patching minParticipants preserves sibling settings', async () => {
            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ config: { minParticipants: 12 } });

            expect(response.status).toBe(200);
            expect(response.body.config).toEqual({
                playerNameDisplay: 'REAL_NAME',
                minParticipants: 12,
                maxParticipants: 32,
                registrationDeadline: '2026-05-20T18:00:00.000Z',
            });
            expect(response.body.maxParticipants).toBe(32);
            expect(response.body.registrationDeadline).toBe('2026-05-20T18:00:00.000Z');
        });

        test('removes one config field with null while preserving sibling settings', async () => {
            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ config: { maxParticipants: null } });

            expect(response.status).toBe(200);
            expect(response.body.config).toEqual({
                playerNameDisplay: 'REAL_NAME',
                registrationDeadline: '2026-05-20T18:00:00.000Z',
            });
            expect(response.body.maxParticipants).toBeNull();
            expect(response.body.registrationDeadline).toBe('2026-05-20T18:00:00.000Z');
        });

        test('stores SQL null when removing the last config fields individually', async () => {
            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({
                    config: {
                        playerNameDisplay: null,
                        maxParticipants: null,
                        registrationDeadline: null,
                    },
                });

            const row = dbManager.db.prepare('SELECT config FROM event WHERE id = ?').get(eventId) as {
                config: string | null;
            };

            expect(response.status).toBe(200);
            expect(response.body.config).toBeNull();
            expect(row.config).toBeNull();
        });

        test('clears config entirely with an explicit null', async () => {
            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ config: null });

            expect(response.status).toBe(200);
            expect(response.body.config).toBeNull();
            expect(response.body.maxParticipants).toBeNull();
            expect(response.body.registrationDeadline).toBeNull();
        });

        test('rejects changing a configured tournament into a season', async () => {
            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ type: 'SEASON', tournament: null });

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('participantConfigOnlyForTournament');
        });

        test('rejects clearing tournament config from a tournament', async () => {
            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ tournament: null });

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('tournamentConfigRequired');
        });

        test('rejects tournament config when changing the event to a season', async () => {
            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ type: 'SEASON', config: null });

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('tournamentConfigOnlyForTournament');
        });

        test('deep-merges info: patching venue keeps schedule and links', async () => {
            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ info: { venue: { name: 'New Venue', address: 'New Street 9', city: 'Lviv' } } });

            expect(response.status).toBe(200);
            expect(response.body.info.venue).toEqual({ name: 'New Venue', address: 'New Street 9', city: 'Lviv' });
            // Sibling info sub-objects survive the partial update.
            expect(response.body.info.schedule).toEqual(seedInfo.schedule);
            expect(response.body.info.links).toEqual(seedInfo.links);
        });

        test('replaces a single info sub-object wholesale, not field-by-field', async () => {
            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ info: { venue: { name: 'Only Name' } } });

            expect(response.status).toBe(200);
            // venue is replaced as a whole — old address/city are gone.
            expect(response.body.info.venue).toEqual({ name: 'Only Name' });
        });

        test('persists paymentInfo in contacts and returns it on the next GET', async () => {
            const paymentInfo = '300 грн [Pay](https://pay.example/x)';
            const patchResponse = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ info: { contacts: { paymentInfo } } });

            const getResponse = await request(app)
                .get(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader);

            expect(patchResponse.status).toBe(200);
            expect(patchResponse.body.info.contacts).toEqual({ paymentInfo });
            expect(getResponse.status).toBe(200);
            expect(getResponse.body.info.contacts).toEqual({ paymentInfo });
        });

        test('rejects paymentInfo longer than 1000 characters', async () => {
            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ info: { contacts: { paymentInfo: 'a'.repeat(1001) } } });

            expect(response.status).toBe(400);
            expect(response.body.details).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    message: 'contacts.paymentInfo must be 1000 characters or less',
                }),
            ]));
        });

        test('clears paymentInfo when a contacts patch omits it', async () => {
            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ info: { contacts: { phone: '+380671234567' } } });

            expect(response.status).toBe(200);
            expect(response.body.info.contacts).toEqual({ phone: '+380671234567' });
            expect(response.body.info.contacts).not.toHaveProperty('paymentInfo');
        });

        test('clears info entirely with an explicit null', async () => {
            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ info: null });

            expect(response.status).toBe(200);
            expect(response.body.info).toBeNull();
        });

        test('does not reset un-patched defaulted fields', async () => {
            // blockGameCreation / startingRating must survive a patch that omits them.
            await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ blockGameCreation: true });

            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ description: 'second patch' });

            expect(response.status).toBe(200);
            expect(response.body.blockGameCreation).toBe(true);
        });

        test('validates the merged result (dateFrom must precede dateTo)', async () => {
            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ dateFrom: '2026-06-01T00:00:00.000Z' }); // after seeded dateTo

            expect(response.status).toBe(400);
        });

        test('rejects an unknown field (strict body)', async () => {
            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', adminAuthHeader)
                .send({ bogusField: 1 });

            expect(response.status).toBe(400);
        });

        test('requires authentication', async () => {
            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .send({ description: 'no auth' });

            expect(response.status).toBe(401);
        });

        test('forbids a non-admin without club permissions', async () => {
            const response = await request(app)
                .patch(`/api/events/${eventId}`)
                .set('Authorization', nonAdminAuthHeader)
                .send({ description: 'nope' });

            expect(response.status).toBe(403);
        });
    });

    describe('DELETE /api/events/:eventId - Delete Event', () => {
        const deletableEventId = 2002;
        const clubOwnerUserId = 88001;
        let clubOwnerAuthHeader: string;

        beforeAll(() => {
            const timestamp = '2024-01-01T00:00:00.000Z';
            dbManager.db.prepare(
                `INSERT INTO user (id, telegramUsername, telegramId, name, nickname, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
                clubOwnerUserId,
                '@clubowner_event',
                88888801,
                'ClubOwnerEventUser',
                '@clubowner_event',
                timestamp,
                timestamp,
                0,
                1,
                0,
                'ACTIVE'
            );
            dbManager.db.prepare(
                `INSERT INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(1, clubOwnerUserId, 'OWNER', 'ACTIVE', timestamp, timestamp, 0);
            clubOwnerAuthHeader = createAuthHeader(clubOwnerUserId);
        });

        afterAll(() => {
            dbManager.db.prepare('DELETE FROM clubMembership WHERE userId = ?').run(clubOwnerUserId);
            dbManager.db.prepare('DELETE FROM user WHERE id = ?').run(clubOwnerUserId);
        });

        beforeEach(() => {
            createCustomEvent(deletableEventId, 'Event To Delete');
        });

        afterEach(() => {
            // Ensure cleanup if delete failed
            deleteEventById(deletableEventId);
        });

        test('should delete event as admin and return 204', async () => {
            const response = await request(app)
                .delete(`/api/events/${deletableEventId}`)
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(204);

            const fetchResponse = await request(app)
                .get(`/api/events/${deletableEventId}`)
                .set('Authorization', adminAuthHeader);
            expect(fetchResponse.status).toBe(404);
        });

        test('should delete event as club owner and return 204', async () => {
            const response = await request(app)
                .delete(`/api/events/${deletableEventId}`)
                .set('Authorization', clubOwnerAuthHeader);

            expect(response.status).toBe(204);

            const fetchResponse = await request(app)
                .get(`/api/events/${deletableEventId}`)
                .set('Authorization', adminAuthHeader);
            expect(fetchResponse.status).toBe(404);
        });

        test('should reject club owner deleting event from another club', async () => {
            const otherClubEventId = 2003;
            const otherClubId = 99;
            const timestamp = '2024-01-01T00:00:00.000Z';
            dbManager.db.prepare(
                `INSERT INTO club (id, name, isActive, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, ?, ?)`
            ).run(otherClubId, 'Other Club For Delete Test', 1, timestamp, timestamp, 0);
            createCustomEvent(otherClubEventId, 'Other Club Event', undefined, undefined, 2, otherClubId);

            const response = await request(app)
                .delete(`/api/events/${otherClubEventId}`)
                .set('Authorization', clubOwnerAuthHeader);

            deleteEventById(otherClubEventId);
            dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(otherClubId);

            expect(response.status).toBe(403);
        });

        test('should reject non-owner club member deleting event', async () => {
            const response = await request(app)
                .delete(`/api/events/${deletableEventId}`)
                .set('Authorization', nonAdminAuthHeader);
            expect(response.status).toBe(403);
        });

        test('should reject deleting global event as non-admin', async () => {
            const globalEventId = 2004;
            createCustomEvent(globalEventId, 'Global Event To Delete', undefined, undefined, 2, null);

            const response = await request(app)
                .delete(`/api/events/${globalEventId}`)
                .set('Authorization', clubOwnerAuthHeader);

            deleteEventById(globalEventId);

            expect(response.status).toBe(403);
        });

        test('should clear club currentRatingEventId when deleting current rating event', async () => {
            dbManager.db.prepare('UPDATE event SET clubId = 1 WHERE id = ?').run(deletableEventId);
            dbManager.db.prepare('UPDATE club SET currentRatingEventId = ? WHERE id = ?').run(deletableEventId, 1);

            const response = await request(app)
                .delete(`/api/events/${deletableEventId}`)
                .set('Authorization', adminAuthHeader);

            const club = dbManager.db.prepare('SELECT currentRatingEventId FROM club WHERE id = ?').get(1) as {
                currentRatingEventId: number | null;
            };

            expect(response.status).toBe(204);
            expect(club.currentRatingEventId).toBeNull();
        });

        test('should reject when not authenticated', async () => {
            const response = await request(app).delete(`/api/events/${deletableEventId}`);
            expect(response.status).toBe(401);
        });

        test('should return 404 for missing event', async () => {
            const response = await request(app)
                .delete('/api/events/99999')
                .set('Authorization', adminAuthHeader);
            expect(response.status).toBe(404);
        });
    });
});
