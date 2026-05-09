import request from 'supertest';
import express from 'express';
import publicRoutes from '../src/routes/PublicRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';

const app = express();
app.use(express.json());
app.use('/api/public', publicRoutes);
app.use(handleErrors);

const SYSTEM_USER_ID = 0;

describe('Public tournament endpoint', () => {
    const TEST_CLUB_ID = 98100;
    const GAME_RULES_ID = 98110;
    const TOURNAMENT_EVENT_ID = 98200;
    const SEASON_EVENT_ID = 98201;
    const PARTICIPANT_USER_ID = 98300;

    let timestampOffset = 0;
    function nextTs(): string {
        timestampOffset += 1;
        return new Date(Date.parse('2026-05-01T00:00:00.000Z') + timestampOffset).toISOString();
    }

    beforeAll(() => {
        const ts = nextTs();
        dbManager.db.prepare(
            `INSERT INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Public Test User', NULL, NULL, 0, 1, 'ACTIVE', ?, ?, ?)`
        ).run(PARTICIPANT_USER_ID, ts, ts, SYSTEM_USER_ID);

        dbManager.db.prepare(
            `INSERT INTO club (id, name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Public Test Club', 'Test address', 'Kyiv', 'Test description', '@test_contact', 1, ?, ?, ?)`
        ).run(TEST_CLUB_ID, ts, ts, SYSTEM_USER_ID);

        dbManager.db.prepare(
            `INSERT INTO gameRules (id, name, numberOfPlayers, uma, startingPoints, chomboPointsAfterUma, clubId)
             VALUES (?, 'Public Test Rules', 4, '[15,5,-5,-15]', 30000, NULL, ?)`
        ).run(GAME_RULES_ID, TEST_CLUB_ID);

        dbManager.db.prepare(
            `INSERT INTO event (id, name, description, type, gameRules, clubId, dateFrom, dateTo, maxParticipants, registrationDeadline, startingRating, minimumGamesForRating, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Public Test Tournament', 'Tournament description', 'TOURNAMENT', ?, ?, NULL, NULL, 8, '2026-06-01T00:00:00.000Z', 0, 0, ?, ?, ?)`
        ).run(TOURNAMENT_EVENT_ID, GAME_RULES_ID, TEST_CLUB_ID, ts, ts, SYSTEM_USER_ID);

        dbManager.db.prepare(
            `INSERT INTO event (id, name, description, type, gameRules, clubId, dateFrom, dateTo, maxParticipants, registrationDeadline, startingRating, minimumGamesForRating, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Public Test Season', NULL, 'SEASON', ?, ?, NULL, NULL, NULL, NULL, 0, 0, ?, ?, ?)`
        ).run(SEASON_EVENT_ID, GAME_RULES_ID, TEST_CLUB_ID, ts, ts, SYSTEM_USER_ID);
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM eventRegistration WHERE eventId IN (?, ?)').run(TOURNAMENT_EVENT_ID, SEASON_EVENT_ID);
        dbManager.db.prepare('DELETE FROM event WHERE id IN (?, ?)').run(TOURNAMENT_EVENT_ID, SEASON_EVENT_ID);
        dbManager.db.prepare('DELETE FROM gameRules WHERE id = ?').run(GAME_RULES_ID);
        dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(TEST_CLUB_ID);
        dbManager.db.prepare('DELETE FROM user WHERE id = ?').run(PARTICIPANT_USER_ID);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    afterEach(() => {
        dbManager.db.prepare('DELETE FROM eventRegistration WHERE eventId = ?').run(TOURNAMENT_EVENT_ID);
    });

    it('returns event, club, and approvedCount with no auth header', async () => {
        const response = await request(app)
            .get(`/api/public/tournaments/${TOURNAMENT_EVENT_ID}`)
            .expect(200);

        expect(response.body.event.id).toBe(TOURNAMENT_EVENT_ID);
        expect(response.body.event.name).toBe('Public Test Tournament');
        expect(response.body.event.maxParticipants).toBe(8);
        expect(response.body.event.registrationDeadline).toBe('2026-06-01T00:00:00.000Z');
        expect(response.body.club.id).toBe(TEST_CLUB_ID);
        expect(response.body.club.name).toBe('Public Test Club');
        expect(response.body.club.contactInfo).toBe('@test_contact');
        expect(response.body.approvedCount).toBe(0);
    });

    it('counts only APPROVED registrations', async () => {
        const ts = nextTs();
        // Insert one APPROVED and one PENDING registration; only APPROVED counts.
        dbManager.db.prepare(
            `INSERT INTO eventRegistration (eventId, userId, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'APPROVED', ?, ?, ?)`
        ).run(TOURNAMENT_EVENT_ID, PARTICIPANT_USER_ID, ts, ts, SYSTEM_USER_ID);

        const response = await request(app)
            .get(`/api/public/tournaments/${TOURNAMENT_EVENT_ID}`)
            .expect(200);

        expect(response.body.approvedCount).toBe(1);
    });

    it('returns 404 for SEASON events to avoid leaking non-tournament details', async () => {
        const response = await request(app)
            .get(`/api/public/tournaments/${SEASON_EVENT_ID}`);

        expect(response.status).toBe(404);
        expect(response.body.errorCode).toBe('eventNotFound');
    });

    it('returns 404 for unknown event ids', async () => {
        const response = await request(app)
            .get('/api/public/tournaments/99999999');

        expect(response.status).toBe(404);
        expect(response.body.errorCode).toBe('eventNotFound');
    });
});
