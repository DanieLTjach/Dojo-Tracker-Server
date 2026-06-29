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
    const HIDDEN_PARTICIPANT_USER_ID = 98301;
    const PENDING_PARTICIPANT_USER_ID = 98302;

    let timestampOffset = 0;
    function nextTs(): string {
        timestampOffset += 1;
        return new Date(Date.parse('2026-05-01T00:00:00.000Z') + timestampOffset).toISOString();
    }

    beforeAll(() => {
        const ts = nextTs();
        dbManager.db.prepare(
            `INSERT INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
             VALUES
                (?, 'Public Test User', NULL, NULL, 0, 1, 'ACTIVE', ?, ?, ?),
                (?, 'Public Hidden User', NULL, NULL, 0, 1, 'ACTIVE', ?, ?, ?),
                (?, 'Public Pending User', NULL, NULL, 0, 1, 'ACTIVE', ?, ?, ?)`
        ).run(
            PARTICIPANT_USER_ID,
            ts,
            ts,
            SYSTEM_USER_ID,
            HIDDEN_PARTICIPANT_USER_ID,
            ts,
            ts,
            SYSTEM_USER_ID,
            PENDING_PARTICIPANT_USER_ID,
            ts,
            ts,
            SYSTEM_USER_ID
        );

        dbManager.db.prepare(
            `INSERT INTO profile (userId, firstName, lastName, hideProfile, modifiedAt, modifiedBy)
             VALUES
                (?, 'Visible', 'Participant', 0, ?, ?),
                (?, 'Hidden', 'Participant', 1, ?, ?)`
        ).run(
            PARTICIPANT_USER_ID,
            ts,
            SYSTEM_USER_ID,
            HIDDEN_PARTICIPANT_USER_ID,
            ts,
            SYSTEM_USER_ID
        );

        dbManager.db.prepare(
            `INSERT INTO club (id, name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Public Test Club', 'Test address', 'Kyiv', 'Test description', '@test_contact', 1, ?, ?, ?)`
        ).run(TEST_CLUB_ID, ts, ts, SYSTEM_USER_ID);

        dbManager.db.prepare(
            `INSERT INTO gameRules (id, name, numberOfPlayers, uma, startingPoints, clubId)
             VALUES (?, 'Public Test Rules', 4, '[15,5,-5,-15]', 30000, ?)`
        ).run(GAME_RULES_ID, TEST_CLUB_ID);

        dbManager.db.prepare(
            `INSERT INTO event (id, name, description, type, gameRules, clubId, dateFrom, dateTo, startingRating, minimumGamesForRating, info, config, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Public Test Tournament', 'Tournament description', 'TOURNAMENT', ?, ?, NULL, NULL, 0, 0, '{"venue":{"name":"Public Dojo"}}', '{"maxParticipants":8,"registrationDeadline":"2026-06-01T00:00:00.000Z"}', ?, ?, ?)`
        ).run(TOURNAMENT_EVENT_ID, GAME_RULES_ID, TEST_CLUB_ID, ts, ts, SYSTEM_USER_ID);

        dbManager.db.prepare(
            `INSERT INTO event (id, name, description, type, gameRules, clubId, dateFrom, dateTo, startingRating, minimumGamesForRating, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Public Test Season', NULL, 'SEASON', ?, ?, NULL, NULL, 0, 0, ?, ?, ?)`
        ).run(SEASON_EVENT_ID, GAME_RULES_ID, TEST_CLUB_ID, ts, ts, SYSTEM_USER_ID);
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM eventRegistration WHERE eventId IN (?, ?)').run(
            TOURNAMENT_EVENT_ID,
            SEASON_EVENT_ID
        );
        dbManager.db.prepare('DELETE FROM event WHERE id IN (?, ?)').run(TOURNAMENT_EVENT_ID, SEASON_EVENT_ID);
        dbManager.db.prepare('DELETE FROM gameRules WHERE id = ?').run(GAME_RULES_ID);
        dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(TEST_CLUB_ID);
        dbManager.db.prepare('DELETE FROM profile WHERE userId IN (?, ?)').run(
            PARTICIPANT_USER_ID,
            HIDDEN_PARTICIPANT_USER_ID
        );
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?, ?)').run(
            PARTICIPANT_USER_ID,
            HIDDEN_PARTICIPANT_USER_ID,
            PENDING_PARTICIPANT_USER_ID
        );
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
        expect(response.body.event.info).toEqual({ venue: { name: 'Public Dojo' } });
        expect(response.body.event.info).not.toHaveProperty('pairings');
        expect(response.body.club.id).toBe(TEST_CLUB_ID);
        expect(response.body.club.name).toBe('Public Test Club');
        expect(response.body.club.contactInfo).toBe('@test_contact');
        expect(response.body.approvedCount).toBe(0);
        expect(response.body.participants).toEqual([]);
    });

    it('returns only approved participants and hides private profile names', async () => {
        dbManager.db.prepare(
            `INSERT INTO eventRegistration (eventId, userId, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'APPROVED', ?, ?, ?)`
        ).run(
            TOURNAMENT_EVENT_ID,
            PARTICIPANT_USER_ID,
            nextTs(),
            nextTs(),
            SYSTEM_USER_ID
        );
        dbManager.db.prepare(
            `INSERT INTO eventRegistration (eventId, userId, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'APPROVED', ?, ?, ?)`
        ).run(
            TOURNAMENT_EVENT_ID,
            HIDDEN_PARTICIPANT_USER_ID,
            nextTs(),
            nextTs(),
            SYSTEM_USER_ID
        );
        dbManager.db.prepare(
            `INSERT INTO eventRegistration (eventId, userId, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'PENDING', ?, ?, ?)`
        ).run(
            TOURNAMENT_EVENT_ID,
            PENDING_PARTICIPANT_USER_ID,
            nextTs(),
            nextTs(),
            SYSTEM_USER_ID
        );

        const response = await request(app)
            .get(`/api/public/tournaments/${TOURNAMENT_EVENT_ID}`)
            .expect(200);

        expect(response.body.approvedCount).toBe(2);
        expect(response.body.participants).toEqual([
            {
                userId: PARTICIPANT_USER_ID,
                userName: 'Public Test User',
                firstName: 'Visible',
                lastName: 'Participant',
                hideProfile: false,
            },
            {
                userId: HIDDEN_PARTICIPANT_USER_ID,
                userName: 'Public Hidden User',
                firstName: null,
                lastName: null,
                hideProfile: true,
            },
        ]);
        expect(response.body.participants).toHaveLength(response.body.approvedCount);
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
