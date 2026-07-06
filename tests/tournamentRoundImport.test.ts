import express from 'express';
import request from 'supertest';
import gameRoutes from '../src/routes/GameRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader, createCustomEvent } from './testHelpers.ts';
import { TournamentRoundImportService } from '../src/service/TournamentRoundImportService.ts';
import { TrackedGameService } from '../src/service/TrackedGameService.ts';
import { DEFAULT_LOCALE, t } from '../src/i18n/index.ts';

const SYSTEM_USER_ID = 0;
const TOURNAMENT_EVENT_ID = 99100;
const ENDED_TOURNAMENT_EVENT_ID = 99101;
const GAME_RULES_ID = 2;
const TEST_CLUB_ID = 1;
const UNREGISTERED_USER_ID = 99199;
const PENDING_USER_ID = 99198;

const app = express();
app.use(express.json());
app.use('/api/games', gameRoutes);
app.use(handleErrors);

function insertApprovedRegistration(eventId: number, userId: number): void {
    const ts = '2024-01-01T00:00:00.000Z';
    dbManager.db.prepare(
        `INSERT OR REPLACE INTO eventRegistration (eventId, userId, status, createdAt, modifiedAt, modifiedBy)
         VALUES (?, ?, 'APPROVED', ?, ?, 0)`
    ).run(eventId, userId, ts, ts);
}

describe('TournamentRoundImportService', () => {
    const importService = new TournamentRoundImportService();

    let user1Id: number;
    let user2Id: number;
    let user3Id: number;
    let user4Id: number;

    beforeAll(() => {
        const ts = '2024-01-01T00:00:00.000Z';

        dbManager.db.prepare(
            `INSERT OR IGNORE INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Import U1', '@import_u1', 991001, 0, 1, 'ACTIVE', ?, ?, 0)`
        ).run(99101, ts, ts);
        dbManager.db.prepare(
            `INSERT OR IGNORE INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Import U2', '@import_u2', 991002, 0, 1, 'ACTIVE', ?, ?, 0)`
        ).run(99102, ts, ts);
        dbManager.db.prepare(
            `INSERT OR IGNORE INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Import U3', '@import_u3', 991003, 0, 1, 'ACTIVE', ?, ?, 0)`
        ).run(99103, ts, ts);
        dbManager.db.prepare(
            `INSERT OR IGNORE INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Import U4', '@import_u4', 991004, 0, 1, 'ACTIVE', ?, ?, 0)`
        ).run(99104, ts, ts);

        user1Id = 99101;
        user2Id = 99102;
        user3Id = 99103;
        user4Id = 99104;

        createCustomEvent(
            TOURNAMENT_EVENT_ID,
            'Import Test Tournament',
            '2024-01-01T00:00:00.000Z',
            '2026-12-31T23:59:59.999Z',
            GAME_RULES_ID,
            TEST_CLUB_ID,
            'TOURNAMENT',
            50
        );
        createCustomEvent(
            ENDED_TOURNAMENT_EVENT_ID,
            'Ended Import Tournament',
            '2000-01-01T00:00:00.000Z',
            '2000-12-31T23:59:59.999Z',
            GAME_RULES_ID,
            TEST_CLUB_ID,
            'TOURNAMENT',
            50
        );

        dbManager.db.prepare(
            `INSERT OR IGNORE INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Import Unregistered', '@import_unreg', 991999, 0, 1, 'ACTIVE', ?, ?, 0)`
        ).run(UNREGISTERED_USER_ID, ts, ts);
        dbManager.db.prepare(
            `INSERT OR IGNORE INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Import Pending', '@import_pending', 991998, 0, 1, 'ACTIVE', ?, ?, 0)`
        ).run(PENDING_USER_ID, ts, ts);

        const membershipTs = new Date().toISOString();
        for (const userId of [user1Id, user2Id, user3Id, user4Id, UNREGISTERED_USER_ID, PENDING_USER_ID]) {
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, 'MEMBER', 'ACTIVE', ?, ?, 0)`
            ).run(TEST_CLUB_ID, userId, membershipTs, membershipTs);
        }

        for (const userId of [user1Id, user2Id, user3Id, user4Id]) {
            insertApprovedRegistration(TOURNAMENT_EVENT_ID, userId);
            insertApprovedRegistration(ENDED_TOURNAMENT_EVENT_ID, userId);
        }
    });

    beforeEach(() => {
        dbManager.db.prepare('DELETE FROM eventRegistration WHERE eventId = ?').run(TOURNAMENT_EVENT_ID);
        for (const userId of [user1Id, user2Id, user3Id, user4Id]) {
            insertApprovedRegistration(TOURNAMENT_EVENT_ID, userId);
        }
        dbManager.db.prepare('DELETE FROM userToGame WHERE gameId IN (SELECT id FROM game WHERE eventId = ?)').run(
            TOURNAMENT_EVENT_ID
        );
        dbManager.db.prepare('DELETE FROM gameRound WHERE gameId IN (SELECT id FROM game WHERE eventId = ?)').run(
            TOURNAMENT_EVENT_ID
        );
        dbManager.db.prepare('DELETE FROM game WHERE eventId = ?').run(TOURNAMENT_EVENT_ID);
    });

    test('imports CREATED games with tournament metadata and seating', () => {
        const text = [
            'Round 2',
            `${user1Id} ${user2Id} ${user3Id} ${user4Id}`,
        ].join('\n');

        const result = importService.parseAndImport(TOURNAMENT_EVENT_ID, 2, text, SYSTEM_USER_ID);

        expect(result.errors).toEqual([]);
        expect(result.imported).toBe(1);
        expect(result.games).toHaveLength(1);

        const table1 = result.games[0]!;
        expect(table1.status).toBe('CREATED');
        expect(table1.tournamentRound).toBe(2);
        expect(table1.tournamentTable).toBe('1');
        expect(table1.startedAt).toBeNull();
        expect(table1.endedAt).toBeNull();
        expect(table1.players).toHaveLength(4);
        expect(table1.players.map(p => ({ userId: p.userId, startPlace: p.startPlace }))).toEqual([
            { userId: user1Id, startPlace: 'EAST' },
            { userId: user2Id, startPlace: 'SOUTH' },
            { userId: user3Id, startPlace: 'WEST' },
            { userId: user4Id, startPlace: 'NORTH' },
        ]);
    });

    test('rejects import for ended tournament', () => {
        const text = `Round 1\n${user1Id} ${user2Id} ${user3Id} ${user4Id}`;

        const result = importService.parseAndImport(ENDED_TOURNAMENT_EVENT_ID, 1, text, SYSTEM_USER_ID);

        expect(result.imported).toBe(0);
        expect(result.errors).toEqual([
            t('telegram.importParse.eventEnded', { eventName: 'Ended Import Tournament' }, DEFAULT_LOCALE),
        ]);
    });

    test('rejects user not registered for tournament', () => {
        const text = `Round 1\n${UNREGISTERED_USER_ID} ${user2Id} ${user3Id} ${user4Id}`;

        const result = importService.parseAndImport(TOURNAMENT_EVENT_ID, 1, text, SYSTEM_USER_ID);

        expect(result.imported).toBe(0);
        expect(result.errors.some(e => e.includes('не зареєстрований'))).toBe(true);
    });

    test('rejects user with non-approved registration', () => {
        const ts = '2024-01-01T00:00:00.000Z';
        dbManager.db.prepare(
            `INSERT INTO eventRegistration (eventId, userId, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'PENDING', ?, ?, 0)`
        ).run(TOURNAMENT_EVENT_ID, PENDING_USER_ID, ts, ts);

        const text = `Round 1\n${user1Id} ${user2Id} ${user3Id} ${PENDING_USER_ID}`;

        const result = importService.parseAndImport(TOURNAMENT_EVENT_ID, 1, text, SYSTEM_USER_ID);

        expect(result.imported).toBe(0);
        expect(result.errors.some(e => e.includes('не схвалений'))).toBe(true);
    });

    test('rejects round mismatch between expected and paste', () => {
        const text = `Round 5\n${user1Id} ${user2Id} ${user3Id} ${user4Id}`;

        const result = importService.parseAndImport(TOURNAMENT_EVENT_ID, 3, text, SYSTEM_USER_ID);

        expect(result.imported).toBe(0);
        expect(result.errors[0]).toBe(
            t('telegram.importParse.roundMismatch', { roundInPaste: 5, expectedRound: 3 }, DEFAULT_LOCALE)
        );
    });

    test('rejects duplicate player across tables', () => {
        const text = [
            'Round 1',
            `${user1Id} ${user2Id} ${user3Id} ${user4Id}`,
            `${user1Id} ${user2Id} ${user3Id} ${user4Id}`,
        ].join('\n');

        const result = importService.parseAndImport(TOURNAMENT_EVENT_ID, 1, text, SYSTEM_USER_ID);

        expect(result.imported).toBe(0);
        expect(result.errors.some(e => e.includes(String(user1Id)))).toBe(true);
    });

    test('rejects re-import for existing round and table', () => {
        const text = `Round 4\n${user1Id} ${user2Id} ${user3Id} ${user4Id}`;

        const first = importService.parseAndImport(TOURNAMENT_EVENT_ID, 4, text, SYSTEM_USER_ID);
        expect(first.imported).toBe(1);

        const second = importService.parseAndImport(TOURNAMENT_EVENT_ID, 4, text, SYSTEM_USER_ID);
        expect(second.imported).toBe(0);
        expect(second.errors.some(e => e.includes('вже існує'))).toBe(true);
    });

    describe('event has not started yet', () => {
        const FUTURE_TOURNAMENT_EVENT_ID = 99102_000;
        const ADMIN_IMPORTER_USER_ID = 99102_001;
        const NON_ADMIN_IMPORTER_USER_ID = 99102_002;

        beforeAll(() => {
            const ts = '2024-01-01T00:00:00.000Z';
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, 'Import Admin', '@import_admin', 9910201, 1, 1, 'ACTIVE', ?, ?, 0)`
            ).run(ADMIN_IMPORTER_USER_ID, ts, ts);
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, 'Import NonAdmin', '@import_nonadmin', 9910202, 0, 1, 'ACTIVE', ?, ?, 0)`
            ).run(NON_ADMIN_IMPORTER_USER_ID, ts, ts);

            dbManager.db.prepare(
                `INSERT OR IGNORE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, 'MEMBER', 'ACTIVE', ?, ?, 0)`
            ).run(TEST_CLUB_ID, NON_ADMIN_IMPORTER_USER_ID, ts, ts);

            // Tournament that starts well in the future relative to "now".
            const futureFrom = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
            const futureTo = new Date(Date.now() + 366 * 24 * 60 * 60 * 1000).toISOString();
            createCustomEvent(
                FUTURE_TOURNAMENT_EVENT_ID,
                'Future Import Tournament',
                futureFrom,
                futureTo,
                GAME_RULES_ID,
                TEST_CLUB_ID,
                'TOURNAMENT',
                10
            );
            for (const userId of [user1Id, user2Id, user3Id, user4Id]) {
                insertApprovedRegistration(FUTURE_TOURNAMENT_EVENT_ID, userId);
            }
        });

        afterAll(() => {
            dbManager.db.prepare('DELETE FROM userToGame WHERE gameId IN (SELECT id FROM game WHERE eventId = ?)').run(
                FUTURE_TOURNAMENT_EVENT_ID
            );
            dbManager.db.prepare('DELETE FROM game WHERE eventId = ?').run(FUTURE_TOURNAMENT_EVENT_ID);
            dbManager.db.prepare('DELETE FROM eventRegistration WHERE eventId = ?').run(FUTURE_TOURNAMENT_EVENT_ID);
            dbManager.db.prepare('DELETE FROM tournament WHERE eventId = ?').run(FUTURE_TOURNAMENT_EVENT_ID);
            dbManager.db.prepare('DELETE FROM event WHERE id = ?').run(FUTURE_TOURNAMENT_EVENT_ID);
            dbManager.db.prepare('DELETE FROM clubMembership WHERE userId IN (?, ?)').run(
                ADMIN_IMPORTER_USER_ID,
                NON_ADMIN_IMPORTER_USER_ID
            );
            dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?)').run(
                ADMIN_IMPORTER_USER_ID,
                NON_ADMIN_IMPORTER_USER_ID
            );
        });

        test('system admin can import even before the event start date', () => {
            const text = `Round 1\n${user1Id} ${user2Id} ${user3Id} ${user4Id}`;

            const result = importService.parseAndImport(FUTURE_TOURNAMENT_EVENT_ID, 1, text, ADMIN_IMPORTER_USER_ID);

            expect(result.errors).toEqual([]);
            expect(result.imported).toBe(1);
            expect(result.games[0]!.status).toBe('CREATED');
        });

        test('non-admin import is blocked with "ще не розпочався" per table', () => {
            // Use a different round than the admin test above so we hit the dateFrom check,
            // not a "round already exists" check.
            const text = `Round 2\n${user1Id} ${user2Id} ${user3Id} ${user4Id}`;

            const result = importService.parseAndImport(
                FUTURE_TOURNAMENT_EVENT_ID,
                2,
                text,
                NON_ADMIN_IMPORTER_USER_ID
            );

            expect(result.imported).toBe(0);
            expect(result.errors).toHaveLength(1);
            // tablePrefix wraps the eventHasntStarted error; assert both fragments are present.
            const tablePrefix = t('telegram.importParse.tablePrefix', { table: 1, message: '' }, DEFAULT_LOCALE);
            const notStartedTail = t('errors.eventHasntStarted', { eventName: '' }, DEFAULT_LOCALE).trim();
            expect(result.errors[0]).toContain(tablePrefix);
            expect(result.errors[0]).toContain(notStartedTail);
        });
    });

    test('imports two tables when players are unique across tables', () => {
        const ts = '2024-01-01T00:00:00.000Z';
        for (const [id, tg] of [[99105, 991005], [99106, 991006], [99107, 991007], [99108, 991008]] as const) {
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, 0, 1, 'ACTIVE', ?, ?, 0)`
            ).run(id, `Import U${id}`, `@import_u${id}`, tg, ts, ts);
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, 'MEMBER', 'ACTIVE', ?, ?, 0)`
            ).run(TEST_CLUB_ID, id, ts, ts);
            insertApprovedRegistration(TOURNAMENT_EVENT_ID, id);
        }

        const text = [
            'Round 7',
            `${user1Id} ${user2Id} ${user3Id} ${user4Id}`,
            `99105 99106 99107 99108`,
        ].join('\n');

        const result = importService.parseAndImport(TOURNAMENT_EVENT_ID, 7, text, SYSTEM_USER_ID);
        expect(result.errors).toEqual([]);
        expect(result.imported).toBe(2);
    });
});

describe('POST /api/games/:gameId/start', () => {
    const importService = new TournamentRoundImportService();
    const user1AuthHeader = createAuthHeader(99101);
    const user2AuthHeader = createAuthHeader(99102);
    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);

    function importCreatedGame(round: number): number {
        const text = `Round ${round}\n99101 99102 99103 99104`;
        const result = importService.parseAndImport(TOURNAMENT_EVENT_ID, round, text, SYSTEM_USER_ID);
        expect(result.imported).toBe(1);
        dbManager.db.prepare('UPDATE tournament SET currentRound = ?, status = ? WHERE eventId = ?')
            .run(round, 'IN_PROGRESS', TOURNAMENT_EVENT_ID);
        return result.games[0]!.id;
    }

    beforeEach(() => {
        for (const userId of [99101, 99102, 99103, 99104]) {
            insertApprovedRegistration(TOURNAMENT_EVENT_ID, userId);
        }
        dbManager.db.prepare('DELETE FROM userToGame WHERE gameId IN (SELECT id FROM game WHERE eventId = ?)').run(
            TOURNAMENT_EVENT_ID
        );
        dbManager.db.prepare('DELETE FROM gameRound WHERE gameId IN (SELECT id FROM game WHERE eventId = ?)').run(
            TOURNAMENT_EVENT_ID
        );
        dbManager.db.prepare('DELETE FROM game WHERE eventId = ?').run(TOURNAMENT_EVENT_ID);
    });

    test('transitions CREATED game to IN_PROGRESS for a game player', async () => {
        const gameId = importCreatedGame(20);

        const response = await request(app)
            .post(`/api/games/${gameId}/start`)
            .set('Authorization', user1AuthHeader);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('IN_PROGRESS');
        expect(response.body.startedAt).not.toBeNull();
        expect(response.body.currentState).toEqual({ wind: 'EAST', dealerNumber: 1, counters: 0, riichiSticks: 0 });
    });

    test('allows any game player to start', async () => {
        const gameId = importCreatedGame(21);

        const response = await request(app)
            .post(`/api/games/${gameId}/start`)
            .set('Authorization', user2AuthHeader);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('IN_PROGRESS');
    });

    test('rejects non-players including admin', async () => {
        const gameId = importCreatedGame(22);

        const adminResponse = await request(app)
            .post(`/api/games/${gameId}/start`)
            .set('Authorization', adminAuthHeader);

        expect(adminResponse.status).toBe(403);
        expect(adminResponse.body.errorCode).toBe('notGamePlayer');

        const unregisteredResponse = await request(app)
            .post(`/api/games/${gameId}/start`)
            .set('Authorization', createAuthHeader(UNREGISTERED_USER_ID));

        expect(unregisteredResponse.status).toBe(403);
        expect(unregisteredResponse.body.errorCode).toBe('notGamePlayer');
    });

    test('rejects club moderator who is not a game player', async () => {
        const gameId = importCreatedGame(23);
        const ts = new Date().toISOString();
        dbManager.db.prepare(
            `INSERT OR IGNORE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'MODERATOR', 'ACTIVE', ?, ?, 0)`
        ).run(TEST_CLUB_ID, UNREGISTERED_USER_ID, ts, ts);

        const response = await request(app)
            .post(`/api/games/${gameId}/start`)
            .set('Authorization', createAuthHeader(UNREGISTERED_USER_ID));

        expect(response.status).toBe(403);
        expect(response.body.errorCode).toBe('notGamePlayer');
    });

    test('rejects when game is not CREATED', async () => {
        const gameId = importCreatedGame(24);

        await request(app)
            .post(`/api/games/${gameId}/start`)
            .set('Authorization', user1AuthHeader);

        const response = await request(app)
            .post(`/api/games/${gameId}/start`)
            .set('Authorization', user1AuthHeader);

        expect(response.status).toBe(400);
        expect(response.body.errorCode).toBe('gameNotCreatedWhenStarting');
    });

    test('rejects when event has ended', async () => {
        const trackedGameService = new TrackedGameService();
        const game = trackedGameService.createTrackedGame(
            ENDED_TOURNAMENT_EVENT_ID,
            [
                { userId: 99101, startPlace: 'EAST' },
                { userId: 99102, startPlace: 'SOUTH' },
                { userId: 99103, startPlace: 'WEST' },
                { userId: 99104, startPlace: 'NORTH' },
            ],
            SYSTEM_USER_ID,
            'CREATED',
            new Date('2000-06-01T12:00:00.000Z'),
            1,
            '1'
        );
        dbManager.db.prepare('UPDATE tournament SET currentRound = 1, status = ? WHERE eventId = ?')
            .run('IN_PROGRESS', ENDED_TOURNAMENT_EVENT_ID);

        const response = await request(app)
            .post(`/api/games/${game.id}/start`)
            .set('Authorization', user1AuthHeader);

        expect(response.status).toBe(400);
        expect(response.body.errorCode).toBe('eventHasEnded');

        dbManager.db.prepare('DELETE FROM userToGame WHERE gameId = ?').run(game.id);
        dbManager.db.prepare('DELETE FROM game WHERE id = ?').run(game.id);
    });
});

describe('createTrackedGame options', () => {
    const trackedGameService = new TrackedGameService();
    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);
    const TEST_EVENT_ID = 1001;

    beforeAll(() => {
        createCustomEvent(
            TEST_EVENT_ID,
            'Tracked options test',
            '2024-01-01T00:00:00.000Z',
            '2026-12-31T23:59:59.999Z'
        );
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM userToGame WHERE gameId IN (SELECT id FROM game WHERE eventId IN (?, ?))')
            .run(TOURNAMENT_EVENT_ID, TEST_EVENT_ID);
        dbManager.db.prepare('DELETE FROM game WHERE eventId IN (?, ?)').run(TOURNAMENT_EVENT_ID, TEST_EVENT_ID);
        dbManager.db.prepare('DELETE FROM eventRegistration WHERE eventId IN (?, ?)').run(
            TOURNAMENT_EVENT_ID,
            TEST_EVENT_ID
        );
        dbManager.db.prepare('DELETE FROM tournament WHERE eventId IN (?, ?)').run(TOURNAMENT_EVENT_ID, TEST_EVENT_ID);
        dbManager.db.prepare('DELETE FROM event WHERE id IN (?, ?)').run(TOURNAMENT_EVENT_ID, TEST_EVENT_ID);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    test('POST /api/games/tracked still creates IN_PROGRESS without tournament fields', async () => {
        const users = dbManager.db.prepare(
            'SELECT id FROM user WHERE isActive = 1 AND id > 0 LIMIT 4'
        ).all() as { id: number }[];

        const response = await request(app)
            .post('/api/games/tracked')
            .set('Authorization', adminAuthHeader)
            .send({
                eventId: TEST_EVENT_ID,
                players: users.map((u, i) => ({
                    userId: u.id,
                    startPlace: ['EAST', 'SOUTH', 'WEST', 'NORTH'][i],
                })),
            });

        expect(response.status).toBe(201);
        expect(response.body.status).toBe('IN_PROGRESS');
        expect(response.body.tournamentRound).toBeNull();
        expect(response.body.tournamentTable).toBeNull();
        expect(response.body.startedAt).toBe(response.body.createdAt);

        dbManager.db.prepare('DELETE FROM userToGame WHERE gameId = ?').run(response.body.id);
        dbManager.db.prepare('DELETE FROM game WHERE id = ?').run(response.body.id);
    });

    test('createTrackedGame with CREATED status sets metadata and null startedAt', () => {
        const users = dbManager.db.prepare(
            'SELECT id FROM user WHERE isActive = 1 AND id > 0 LIMIT 4'
        ).all() as { id: number }[];

        const game = trackedGameService.createTrackedGame(
            TEST_EVENT_ID,
            users.map((u, i) => ({
                userId: u.id,
                startPlace: (['EAST', 'SOUTH', 'WEST', 'NORTH'] as const)[i]!,
            })),
            SYSTEM_USER_ID,
            'CREATED',
            new Date(),
            9,
            '7'
        );

        expect(game.status).toBe('CREATED');
        expect(game.tournamentRound).toBe(9);
        expect(game.tournamentTable).toBe('7');
        expect(game.startedAt).toBeNull();

        dbManager.db.prepare('DELETE FROM userToGame WHERE gameId = ?').run(game.id);
        dbManager.db.prepare('DELETE FROM game WHERE id = ?').run(game.id);
    });
});
