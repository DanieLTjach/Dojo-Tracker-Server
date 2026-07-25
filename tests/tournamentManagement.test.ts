import express from 'express';
import request from 'supertest';
import eventRoutes from '../src/routes/EventRoutes.ts';
import gameRoutes from '../src/routes/GameRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader, createCustomEvent } from './testHelpers.ts';
import { TournamentRoundImportService } from '../src/service/TournamentRoundImportService.ts';

const SYSTEM_USER_ID = 0;
const TOURNAMENT_EVENT_ID = 99400;
const SEASON_EVENT_ID = 99401;
const TEST_CLUB_ID = 1;
const GAME_RULES_ID = 2;
const OWNER_USER_ID = 99410;
const MODERATOR_USER_ID = 99411;
const PLAYER_IDS = [99401, 99402, 99403, 99404] as const;

const app = express();
app.use(express.json());
app.use('/api/events', eventRoutes);
app.use('/api/games', gameRoutes);
app.use(handleErrors);

const importService = new TournamentRoundImportService();

const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);
const ownerAuthHeader = createAuthHeader(OWNER_USER_ID);
const moderatorAuthHeader = createAuthHeader(MODERATOR_USER_ID);
const playerAuthHeader = createAuthHeader(PLAYER_IDS[0]);

function insertApprovedRegistration(eventId: number, userId: number): void {
    const ts = '2024-01-01T00:00:00.000Z';
    dbManager.db.prepare(
        `INSERT OR REPLACE INTO eventRegistration (eventId, userId, status, createdAt, modifiedAt, modifiedBy)
         VALUES (?, ?, 'APPROVED', ?, ?, 0)`
    ).run(eventId, userId, ts, ts);
}

function cleanupEvent(eventId: number): void {
    dbManager.db.prepare('DELETE FROM gameRound WHERE gameId IN (SELECT id FROM game WHERE eventId = ?)').run(eventId);
    dbManager.db.prepare('DELETE FROM userToGame WHERE gameId IN (SELECT id FROM game WHERE eventId = ?)').run(eventId);
    dbManager.db.prepare('DELETE FROM userRatingChange WHERE eventId = ?').run(eventId);
    dbManager.db.prepare('DELETE FROM game WHERE eventId = ?').run(eventId);
    dbManager.db.prepare('DELETE FROM eventRegistration WHERE eventId = ?').run(eventId);
    dbManager.db.prepare('DELETE FROM tournament WHERE eventId = ?').run(eventId);
    dbManager.db.prepare('DELETE FROM event WHERE id = ?').run(eventId);
}

function importRound(round: number): number {
    const text = `Round ${round}\n${PLAYER_IDS.join(' ')}`;
    const result = importService.parseAndImport(TOURNAMENT_EVENT_ID, round, text, SYSTEM_USER_ID);
    expect(result.errors).toEqual([]);
    expect(result.imported).toBe(1);
    return result.games[0]!.id;
}

function markRoundFinished(round: number): void {
    dbManager.db.prepare(`
        UPDATE game
        SET status = 'FINISHED',
            startedAt = COALESCE(startedAt, createdAt),
            endedAt = '2026-06-01T12:00:00.000Z'
        WHERE eventId = ? AND tournamentRound = ?
    `).run(TOURNAMENT_EVENT_ID, round);
}

describe('Tournament management', () => {
    beforeAll(() => {
        const ts = '2024-01-01T00:00:00.000Z';
        for (const userId of [...PLAYER_IDS, OWNER_USER_ID, MODERATOR_USER_ID]) {
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO user (id, name, nickname, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, ?, 0, 1, 'ACTIVE', ?, ?, 0)`
            ).run(
                userId,
                `Tournament User ${userId}`,
                `@tournament_${userId}`,
                `@tournament_${userId}`,
                userId + 1000000,
                ts,
                ts
            );
        }

        for (const userId of PLAYER_IDS) {
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, 'MEMBER', 'ACTIVE', ?, ?, 0)`
            ).run(TEST_CLUB_ID, userId, ts, ts);
        }

        dbManager.db.prepare(
            `INSERT OR IGNORE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'OWNER', 'ACTIVE', ?, ?, 0)`
        ).run(TEST_CLUB_ID, OWNER_USER_ID, ts, ts);
        dbManager.db.prepare(
            `INSERT OR IGNORE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'MODERATOR', 'ACTIVE', ?, ?, 0)`
        ).run(TEST_CLUB_ID, MODERATOR_USER_ID, ts, ts);
    });

    beforeEach(() => {
        createCustomEvent(
            TOURNAMENT_EVENT_ID,
            'Managed Tournament',
            '2026-01-01T00:00:00.000Z',
            '2030-01-01T00:00:00.000Z',
            GAME_RULES_ID,
            TEST_CLUB_ID,
            'TOURNAMENT',
            3
        );
        for (const userId of PLAYER_IDS) {
            insertApprovedRegistration(TOURNAMENT_EVENT_ID, userId);
        }
    });

    afterEach(() => {
        cleanupEvent(TOURNAMENT_EVENT_ID);
        cleanupEvent(SEASON_EVENT_ID);
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM clubMembership WHERE userId IN (?, ?, ?, ?, ?, ?)').run(
            ...PLAYER_IDS,
            OWNER_USER_ID,
            MODERATOR_USER_ID
        );
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?, ?, ?, ?, ?)').run(
            ...PLAYER_IDS,
            OWNER_USER_ID,
            MODERATOR_USER_ID
        );
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    test('starts round 1 even without pre-generated games (seating done outside the app)', async () => {
        const response = await request(app)
            .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/start`)
            .set('Authorization', adminAuthHeader)
            .send({});

        expect(response.status).toBe(200);
        expect(response.body.tournament).toMatchObject({
            status: 'IN_PROGRESS',
            currentRound: 1,
            totalRounds: 3,
        });
    });

    test('starts round 1 when games are prepared', async () => {
        importRound(1);

        const response = await request(app)
            .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/start`)
            .set('Authorization', adminAuthHeader)
            .send({});

        expect(response.status).toBe(200);
        expect(response.body.tournament).toMatchObject({
            status: 'IN_PROGRESS',
            currentRound: 1,
            totalRounds: 3,
        });
    });

    test('is idempotent: re-posting the current round is a no-op, not a skip', async () => {
        importRound(1);

        await request(app)
            .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/start`)
            .set('Authorization', adminAuthHeader)
            .send({})
            .expect(200);

        const duplicate = await request(app)
            .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/start`)
            .set('Authorization', adminAuthHeader)
            .send({});

        expect(duplicate.status).toBe(200);
        expect(duplicate.body.tournament).toMatchObject({
            status: 'IN_PROGRESS',
            currentRound: 1,
        });
    });

    test('rejects starting a round out of sequence', async () => {
        const response = await request(app)
            .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/2/start`)
            .set('Authorization', adminAuthHeader)
            .send({});

        expect(response.status).toBe(400);
        expect(response.body.errorCode).toBe('tournamentRoundOutOfSequence');
    });

    test('rejects starting round 2 until every round 1 game is finished', async () => {
        importRound(1);
        importRound(2);

        await request(app)
            .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/start`)
            .set('Authorization', adminAuthHeader)
            .send({})
            .expect(200);

        const response = await request(app)
            .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/2/start`)
            .set('Authorization', adminAuthHeader)
            .send({});

        expect(response.status).toBe(400);
        expect(response.body.errorCode).toBe('tournamentRoundGamesNotFinished');
    });

    test('keeps completed round open until the next round is explicitly started', async () => {
        importRound(1);
        importRound(2);

        await request(app)
            .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/start`)
            .set('Authorization', adminAuthHeader)
            .send({})
            .expect(200);
        markRoundFinished(1);

        const paused = await request(app)
            .get(`/api/events/${TOURNAMENT_EVENT_ID}`)
            .set('Authorization', adminAuthHeader);
        expect(paused.body.tournament).toMatchObject({
            status: 'IN_PROGRESS',
            currentRound: 1,
        });

        const nextRound = await request(app)
            .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/2/start`)
            .set('Authorization', adminAuthHeader)
            .send({});

        expect(nextRound.status).toBe(200);
        expect(nextRound.body.tournament).toMatchObject({
            status: 'IN_PROGRESS',
            currentRound: 2,
        });
    });

    test('sets LAST_ROUND for final round and finishes after final games are done', async () => {
        dbManager.db.prepare('UPDATE tournament SET totalRounds = 2 WHERE eventId = ?').run(TOURNAMENT_EVENT_ID);
        importRound(1);
        importRound(2);

        await request(app)
            .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/start`)
            .set('Authorization', adminAuthHeader)
            .send({})
            .expect(200);
        markRoundFinished(1);

        const finalRound = await request(app)
            .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/2/start`)
            .set('Authorization', adminAuthHeader)
            .send({});
        expect(finalRound.status).toBe(200);
        expect(finalRound.body.tournament).toMatchObject({
            status: 'LAST_ROUND',
            currentRound: 2,
        });

        const unfinishedFinish = await request(app)
            .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/finish`)
            .set('Authorization', adminAuthHeader)
            .send({});
        expect(unfinishedFinish.status).toBe(400);
        expect(unfinishedFinish.body.errorCode).toBe('tournamentRoundGamesNotFinished');

        markRoundFinished(2);
        const finished = await request(app)
            .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/finish`)
            .set('Authorization', ownerAuthHeader)
            .send({});

        expect(finished.status).toBe(200);
        expect(finished.body.tournament).toMatchObject({
            status: 'FINISHED',
            currentRound: 2,
        });
    });

    test('allows club moderator to start a tournament round', async () => {
        importRound(1);

        const response = await request(app)
            .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/start`)
            .set('Authorization', moderatorAuthHeader)
            .send({});

        expect(response.status).toBe(200);
        expect(response.body.tournament.currentRound).toBe(1);
    });

    test('rejects regular member starting a tournament round', async () => {
        importRound(1);

        const response = await request(app)
            .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/start`)
            .set('Authorization', playerAuthHeader)
            .send({});

        expect(response.status).toBe(403);
    });

    test('blocks starting a future-round game before tournament currentRound reaches it', async () => {
        const round1GameId = importRound(1);
        const round2GameId = importRound(2);

        await request(app)
            .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/start`)
            .set('Authorization', adminAuthHeader)
            .send({})
            .expect(200);

        const futureGame = await request(app)
            .post(`/api/games/${round2GameId}/start`)
            .set('Authorization', playerAuthHeader)
            .send({});
        expect(futureGame.status).toBe(400);
        expect(futureGame.body.errorCode).toBe('tournamentGameNotInCurrentRound');

        const currentGame = await request(app)
            .post(`/api/games/${round1GameId}/start`)
            .set('Authorization', playerAuthHeader)
            .send({});
        expect(currentGame.status).toBe(200);
        expect(currentGame.body.status).toBe('IN_PROGRESS');
    });

    test('records a planned result only for a game in the current tournament round', async () => {
        const round1GameId = importRound(1);
        const round2GameId = importRound(2);
        await request(app)
            .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/start`)
            .set('Authorization', adminAuthHeader)
            .send({})
            .expect(200);

        const results = PLAYER_IDS.map((userId, index) => ({
            userId,
            points: [45000, 32000, 25000, 18000][index],
        }));
        const futureRound = await request(app)
            .post(`/api/games/${round2GameId}/result`)
            .set('Authorization', adminAuthHeader)
            .send({ results });
        expect(futureRound.status).toBe(400);
        expect(futureRound.body.errorCode).toBe('tournamentGameNotInCurrentRound');

        const currentRound = await request(app)
            .post(`/api/games/${round1GameId}/result`)
            .set('Authorization', playerAuthHeader)
            .send({ results });
        expect(currentRound.status).toBe(200);
        expect(currentRound.body).toMatchObject({
            id: round1GameId,
            status: 'FINISHED',
            tournamentRound: 1,
            rounds: [],
        });
    });

    test('keeps CREATED non-tournament tracked game start behavior unchanged', async () => {
        createCustomEvent(
            SEASON_EVENT_ID,
            'Tracked Season Event',
            '2026-01-01T00:00:00.000Z',
            '2030-01-01T00:00:00.000Z',
            GAME_RULES_ID,
            TEST_CLUB_ID,
            'SEASON'
        );

        const createResponse = await request(app)
            .post('/api/games/tracked')
            .set('Authorization', playerAuthHeader)
            .send({
                eventId: SEASON_EVENT_ID,
                status: 'CREATED',
                players: PLAYER_IDS.map((userId, index) => ({
                    userId,
                    startPlace: ['EAST', 'SOUTH', 'WEST', 'NORTH'][index],
                })),
            });
        expect(createResponse.status).toBe(201);

        const startResponse = await request(app)
            .post(`/api/games/${createResponse.body.id}/start`)
            .set('Authorization', playerAuthHeader)
            .send({});

        expect(startResponse.status).toBe(200);
        expect(startResponse.body.status).toBe('IN_PROGRESS');
    });

    describe('cancel tournament round', () => {
        async function startRound(round: number, authHeader = adminAuthHeader): Promise<void> {
            await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/${round}/start`)
                .set('Authorization', authHeader)
                .send({})
                .expect(200);
        }

        test('cancels the current first round back to the un-started state', async () => {
            importRound(1);
            await startRound(1);

            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/cancel`)
                .set('Authorization', adminAuthHeader)
                .send({});

            expect(response.status).toBe(200);
            expect(response.body.tournament).toMatchObject({
                status: 'CREATED',
                currentRound: null,
                totalRounds: 3,
            });
        });

        test('cancels a later round back to the previous one', async () => {
            importRound(1);
            importRound(2);
            await startRound(1);
            markRoundFinished(1);
            await startRound(2);

            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/2/cancel`)
                .set('Authorization', adminAuthHeader)
                .send({});

            expect(response.status).toBe(200);
            expect(response.body.tournament).toMatchObject({
                status: 'IN_PROGRESS',
                currentRound: 1,
            });
        });

        test('rejects cancelling a round that is not the current one', async () => {
            importRound(1);
            await startRound(1);

            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/2/cancel`)
                .set('Authorization', adminAuthHeader)
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('tournamentRoundNotCurrent');
        });

        test('rejects cancelling when nothing has been started', async () => {
            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/cancel`)
                .set('Authorization', adminAuthHeader)
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('tournamentRoundNotStarted');
        });

        test('rejects cancelling a round whose games are already finished', async () => {
            importRound(1);
            await startRound(1);
            markRoundFinished(1);

            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/cancel`)
                .set('Authorization', adminAuthHeader)
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('tournamentRoundAlreadyPlayed');
        });

        test('rejects cancelling a round whose games are in progress', async () => {
            const round1GameId = importRound(1);
            await startRound(1);

            await request(app)
                .post(`/api/games/${round1GameId}/start`)
                .set('Authorization', playerAuthHeader)
                .send({})
                .expect(200);

            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/cancel`)
                .set('Authorization', adminAuthHeader)
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('tournamentRoundAlreadyPlayed');
        });

        test('rejects cancelling a finished tournament', async () => {
            dbManager.db.prepare('UPDATE tournament SET totalRounds = 1 WHERE eventId = ?').run(TOURNAMENT_EVENT_ID);
            importRound(1);
            await startRound(1);
            markRoundFinished(1);
            await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/finish`)
                .set('Authorization', adminAuthHeader)
                .send({})
                .expect(200);

            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/cancel`)
                .set('Authorization', adminAuthHeader)
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('tournamentAlreadyFinished');
        });

        test('allows a club moderator to cancel a round', async () => {
            importRound(1);
            await startRound(1);

            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/cancel`)
                .set('Authorization', moderatorAuthHeader)
                .send({});

            expect(response.status).toBe(200);
            expect(response.body.tournament).toMatchObject({ status: 'CREATED', currentRound: null });
        });

        test('rejects a regular member cancelling a round', async () => {
            importRound(1);
            await startRound(1);

            const response = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/cancel`)
                .set('Authorization', playerAuthHeader)
                .send({});

            expect(response.status).toBe(403);
        });

        test('lets a round be started again after cancelling (regenerate-seating flow)', async () => {
            importRound(1);
            await startRound(1);

            await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/cancel`)
                .set('Authorization', adminAuthHeader)
                .send({})
                .expect(200);

            const restart = await request(app)
                .post(`/api/events/${TOURNAMENT_EVENT_ID}/tournament/rounds/1/start`)
                .set('Authorization', adminAuthHeader)
                .send({});

            expect(restart.status).toBe(200);
            expect(restart.body.tournament).toMatchObject({ status: 'IN_PROGRESS', currentRound: 1 });
        });
    });
});
