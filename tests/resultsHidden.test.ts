import request from 'supertest';
import express from 'express';
import ratingRoutes from '../src/routes/RatingRoutes.ts';
import gameRoutes from '../src/routes/GameRoutes.ts';
import userRoutes from '../src/routes/UserRoutes.ts';
import userStatsRoutes from '../src/routes/UserStatsRoutes.ts';
import eventRoutes from '../src/routes/EventRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader, createCustomEvent, createTelegramInitData } from './testHelpers.ts';

// Verifies the resultsHidden config gate: when an organizer hides results, the
// rating/standings, per-user stats and achievements endpoints return 403
// (errorCode resultsHidden) for regular participants, the games endpoint blanks
// per-player rating deltas (keeping points), and managers (system admins and
// club OWNER/MODERATOR) still get everything.

const app = express();
app.use(express.json());
app.use('/api', ratingRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/users', userRoutes);
app.use('/api/events', userStatsRoutes);
app.use('/api/events', eventRoutes);
app.use(handleErrors);

const SYSTEM_USER_ID = 0; // system admin → always a manager
const TEST_CLUB_ID = 1;
const EVENT_ID = 99700;
const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);

async function createTestUser(name: string, telegramId: number): Promise<number> {
    const initData = createTelegramInitData(telegramId, name.toLowerCase());
    const response = await request(app)
        .post('/api/users')
        .set('Authorization', adminAuthHeader)
        .query(initData)
        .send({ name });
    expect(response.status).toBe(201);
    const userId = response.body.id;
    await request(app).post(`/api/users/${userId}/activate`).set('Authorization', adminAuthHeader);
    return userId;
}

function seedClubMembership(userId: number, role: 'MEMBER' | 'MODERATOR' | 'OWNER') {
    const ts = new Date().toISOString();
    dbManager.db.prepare(
        `INSERT OR REPLACE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
         VALUES (?, ?, ?, 'ACTIVE', ?, ?, 0)`
    ).run(TEST_CLUB_ID, userId, role, ts, ts);
}

function setResultsHidden(hidden: boolean) {
    dbManager.db.prepare('UPDATE event SET config = ? WHERE id = ?')
        .run(JSON.stringify({ resultsHidden: hidden }), EVENT_ID);
}

describe('resultsHidden gate', () => {
    let playerId: number;
    let moderatorId: number;

    beforeEach(async () => {
        dbManager.closeDB();
        cleanupTestDatabase();
        dbManager.reinitDB();

        createCustomEvent(
            EVENT_ID,
            'Hidden Results Cup',
            '2024-01-01T00:00:00.000Z',
            '2030-01-01T00:00:00.000Z',
            2,
            TEST_CLUB_ID,
            'TOURNAMENT',
            2
        );

        playerId = await createTestUser('HiddenPlayer', 99701);
        moderatorId = await createTestUser('HiddenMod', 99702);
        const player3Id = await createTestUser('HiddenP3', 99703);
        const player4Id = await createTestUser('HiddenP4', 99704);
        seedClubMembership(playerId, 'MEMBER');
        seedClubMembership(moderatorId, 'MODERATOR');
        seedClubMembership(player3Id, 'MEMBER');
        seedClubMembership(player4Id, 'MEMBER');

        // Seed a finished game so the rating endpoint has data to return.
        await request(app)
            .post('/api/games')
            .set('Authorization', adminAuthHeader)
            .send({
                eventId: EVENT_ID,
                playersData: [
                    { userId: playerId, points: 45000, startPlace: 'EAST' },
                    { userId: moderatorId, points: 35000, startPlace: 'SOUTH' },
                    { userId: player3Id, points: 25000, startPlace: 'WEST' },
                    { userId: player4Id, points: 15000, startPlace: 'NORTH' },
                ],
            })
            .expect(201);
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('when results are visible', () => {
        beforeEach(() => setResultsHidden(false));

        test('a regular participant can read the leaderboard', async () => {
            const res = await request(app)
                .get(`/api/events/${EVENT_ID}/rating`)
                .set('Authorization', createAuthHeader(playerId));
            expect(res.status).toBe(200);
            expect(res.body.length).toBeGreaterThan(0);
        });
    });

    describe('when results are hidden', () => {
        beforeEach(() => setResultsHidden(true));

        test('blocks a regular participant from the leaderboard with errorCode resultsHidden', async () => {
            const res = await request(app)
                .get(`/api/events/${EVENT_ID}/rating`)
                .set('Authorization', createAuthHeader(playerId));
            expect(res.status).toBe(403);
            expect(res.body.errorCode).toBe('resultsHidden');
        });

        test('blocks a regular participant from per-user stats', async () => {
            const res = await request(app)
                .get(`/api/events/${EVENT_ID}/users/${playerId}/stats`)
                .set('Authorization', createAuthHeader(playerId));
            expect(res.status).toBe(403);
            expect(res.body.errorCode).toBe('resultsHidden');
        });

        test('blocks a regular participant from rating history', async () => {
            const res = await request(app)
                .get(`/api/events/${EVENT_ID}/users/${playerId}/rating/history`)
                .set('Authorization', createAuthHeader(playerId));
            expect(res.status).toBe(403);
            expect(res.body.errorCode).toBe('resultsHidden');
        });

        test('a club moderator can still read the leaderboard', async () => {
            const res = await request(app)
                .get(`/api/events/${EVENT_ID}/rating`)
                .set('Authorization', createAuthHeader(moderatorId));
            expect(res.status).toBe(200);
            expect(res.body.length).toBeGreaterThan(0);
        });

        test('a system admin can still read the leaderboard', async () => {
            const res = await request(app)
                .get(`/api/events/${EVENT_ID}/rating`)
                .set('Authorization', adminAuthHeader);
            expect(res.status).toBe(200);
            expect(res.body.length).toBeGreaterThan(0);
        });

        test('blocks a regular participant from event achievements', async () => {
            const res = await request(app)
                .get(`/api/events/${EVENT_ID}/achievements`)
                .set('Authorization', createAuthHeader(playerId));
            expect(res.status).toBe(403);
            expect(res.body.errorCode).toBe('resultsHidden');
        });

        test('blanks per-player rating deltas in games for a regular participant but keeps points', async () => {
            const res = await request(app)
                .get(`/api/games?eventId=${EVENT_ID}`)
                .set('Authorization', createAuthHeader(playerId));
            expect(res.status).toBe(200);
            expect(res.body.length).toBeGreaterThan(0);
            for (const game of res.body) {
                for (const player of game.players) {
                    expect(player.ratingChange).toBeNull();
                    expect(typeof player.points).toBe('number');
                }
            }
        });

        test('keeps per-player rating deltas in games for a manager', async () => {
            const res = await request(app)
                .get(`/api/games?eventId=${EVENT_ID}`)
                .set('Authorization', adminAuthHeader);
            expect(res.status).toBe(200);
            const someDelta = res.body.flatMap((g: { players: { ratingChange: number | null }[] }) => g.players)
                .some((p: { ratingChange: number | null }) => p.ratingChange !== null);
            expect(someDelta).toBe(true);
        });
    });
});
