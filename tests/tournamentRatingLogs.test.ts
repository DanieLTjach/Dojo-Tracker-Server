import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import gameRoutes from '../src/routes/GameRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader, createCustomEvent } from './testHelpers.ts';
import LogService from '../src/service/LogService.ts';

const SYSTEM_USER_ID = 0;
const TOURNAMENT_EVENT_ID = 99600;
const TEST_CLUB_ID = 1;
const GAME_RULES_ID = 2;
const PLAYER_IDS = [99601, 99602, 99603, 99604] as const;

const app = express();
app.use(express.json());
app.use('/api/games', gameRoutes);
app.use(handleErrors);

const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);

function cleanupEvent(eventId: number): void {
    dbManager.db.prepare('DELETE FROM userRatingChange WHERE eventId = ?').run(eventId);
    dbManager.db.prepare('DELETE FROM userToGame WHERE gameId IN (SELECT id FROM game WHERE eventId = ?)').run(eventId);
    dbManager.db.prepare('DELETE FROM game WHERE eventId = ?').run(eventId);
    dbManager.db.prepare('DELETE FROM tournament WHERE eventId = ?').run(eventId);
    dbManager.db.prepare('DELETE FROM eventAchievement WHERE eventId = ?').run(eventId);
    dbManager.db.prepare('DELETE FROM event WHERE id = ?').run(eventId);
}

async function addScoreOnlyTournamentGame(round: number) {
    return request(app)
        .post('/api/games')
        .set('Authorization', adminAuthHeader)
        .send({
            eventId: TOURNAMENT_EVENT_ID,
            tournamentRound: round,
            tournamentTable: '1',
            playersData: PLAYER_IDS.map((userId, index) => ({
                userId,
                points: [40000, 32000, 26000, 22000][index],
                startPlace: ['EAST', 'SOUTH', 'WEST', 'NORTH'][index],
            })),
        });
}

function ratingUpdateLogCalls(spy: jest.SpiedFunction<typeof LogService.logInfo>): unknown[][] {
    return spy.mock.calls.filter(([message]) =>
        typeof message === 'string' &&
        message.includes('Додано') &&
        message.includes('нову гру')
    );
}

describe('Tournament rating update logs', () => {
    beforeAll(() => {
        const ts = '2024-01-01T00:00:00.000Z';
        for (const userId of PLAYER_IDS) {
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, 0, 1, 'ACTIVE', ?, ?, 0)`
            ).run(userId, `Rating Log User ${userId}`, `@rating_log_${userId}`, userId + 1000000, ts, ts);
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, 'MEMBER', 'ACTIVE', ?, ?, 0)`
            ).run(TEST_CLUB_ID, userId, ts, ts);
        }
    });

    beforeEach(() => {
        createCustomEvent(
            TOURNAMENT_EVENT_ID,
            'Rating Log Tournament',
            '2026-01-01T00:00:00.000Z',
            '2030-01-01T00:00:00.000Z',
            GAME_RULES_ID,
            TEST_CLUB_ID,
            'TOURNAMENT',
            2
        );
    });

    afterEach(() => {
        cleanupEvent(TOURNAMENT_EVENT_ID);
        jest.restoreAllMocks();
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM clubMembership WHERE userId IN (?, ?, ?, ?)').run(...PLAYER_IDS);
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?, ?, ?)').run(...PLAYER_IDS);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    test('emits rating update log before LAST_ROUND', async () => {
        dbManager.db.prepare('UPDATE tournament SET currentRound = 1, status = ? WHERE eventId = ?')
            .run('IN_PROGRESS', TOURNAMENT_EVENT_ID);
        const logSpy = jest.spyOn(LogService, 'logInfo').mockImplementation(() => undefined);

        const response = await addScoreOnlyTournamentGame(1);

        expect(response.status).toBe(201);
        expect(ratingUpdateLogCalls(logSpy)).toHaveLength(1);
    });

    test('suppresses rating update log in LAST_ROUND', async () => {
        dbManager.db.prepare('UPDATE tournament SET currentRound = 2, status = ? WHERE eventId = ?')
            .run('LAST_ROUND', TOURNAMENT_EVENT_ID);
        const logSpy = jest.spyOn(LogService, 'logInfo').mockImplementation(() => undefined);

        const response = await addScoreOnlyTournamentGame(2);

        expect(response.status).toBe(201);
        expect(ratingUpdateLogCalls(logSpy)).toHaveLength(0);
    });
});
