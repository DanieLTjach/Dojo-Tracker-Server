import { dbManager } from '../src/db/dbInit.ts';
import { createCustomEvent, deleteEventById, openEventWindow } from './testHelpers.ts';
import { ImportService } from '../src/service/ImportService.ts';

const EVENT_ID = 99300;
const GAME_RULES_ID = 2; // yonma, startingPoints 30000
const TEST_CLUB_ID = 1;

// Two players registered the normal way, two that predate Telegram registration and so have
// no telegramUsername — the case that forces --match-by name.
const WITH_USERNAME = [
    { id: 99301, name: 'MatchBy Named One', telegramUsername: '@matchby_one', telegramId: 993001 },
    { id: 99302, name: 'MatchBy Named Two', telegramUsername: '@matchby_two', telegramId: 993002 },
];
const WITHOUT_USERNAME = [
    { id: 99303, name: 'MatchBy Legacy Three' },
    { id: 99304, name: 'MatchBy Legacy Four' },
];

function header(): string {
    const cols: string[] = [];
    for (let p = 1; p <= 4; p++) {
        cols.push(`player${p}_username`, `player${p}_points`, `player${p}_startPlace`, `player${p}_chombo`);
    }
    return cols.join(',');
}

/** One valid yonma row: points sum to 4 × 30000 = 120000. */
function row(identifiers: string[]): string {
    const points = [40000, 30000, 30000, 20000];
    const winds = ['EAST', 'SOUTH', 'WEST', 'NORTH'];
    const cells: string[] = [];
    for (let i = 0; i < 4; i++) {
        cells.push(identifiers[i]!, String(points[i]), winds[i]!, '0');
    }
    return cells.join(',');
}

describe('ImportService matchBy', () => {
    const importService = new ImportService();

    beforeAll(() => {
        const ts = '2024-01-01T00:00:00.000Z';

        for (const u of WITH_USERNAME) {
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, 0, 1, 'ACTIVE', ?, ?, 0)`
            ).run(u.id, u.name, u.telegramUsername, u.telegramId, ts, ts);
        }
        for (const u of WITHOUT_USERNAME) {
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, NULL, NULL, 0, 1, 'ACTIVE', ?, ?, 0)`
            ).run(u.id, u.name, ts, ts);
        }

        const allIds = [...WITH_USERNAME.map(u => u.id), ...WITHOUT_USERNAME.map(u => u.id)];
        for (const userId of allIds) {
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, 'MEMBER', 'ACTIVE', ?, ?, 0)`
            ).run(TEST_CLUB_ID, userId, ts, ts);
        }

        createCustomEvent(
            EVENT_ID,
            'MatchBy Import Season',
            openEventWindow().dateFrom,
            openEventWindow().dateTo,
            GAME_RULES_ID,
            TEST_CLUB_ID,
            'SEASON'
        );
    });

    afterAll(() => {
        // Games imported by these tests reference the event, so they must go first.
        dbManager.db.prepare(
            'DELETE FROM userRatingChange WHERE gameId IN (SELECT id FROM game WHERE eventId = ?)'
        ).run(EVENT_ID);
        dbManager.db.prepare(
            'DELETE FROM userToGame WHERE gameId IN (SELECT id FROM game WHERE eventId = ?)'
        ).run(EVENT_ID);
        dbManager.db.prepare('DELETE FROM game WHERE eventId = ?').run(EVENT_ID);
        deleteEventById(EVENT_ID);
    });

    it('defaults to matching users by telegramUsername', () => {
        const csv = [
            header(),
            row(['@matchby_one', '@matchby_two', '@matchby_one', '@matchby_two']),
        ].join('\n');

        // Same two users twice — resolves by username, then fails the duplicate-player rule.
        const result = importService.validateGames(EVENT_ID, csv);

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]!.message).not.toContain('was not found');
    });

    it('cannot resolve users without a telegramUsername in the default mode', () => {
        const csv = [
            header(),
            row(['@matchby_one', '@matchby_two', 'MatchBy Legacy Three', 'MatchBy Legacy Four']),
        ].join('\n');

        const result = importService.validateGames(EVENT_ID, csv);

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]!.message).toContain('MatchBy Legacy Three');
    });

    it('resolves users by display name when matchBy is "name"', () => {
        const csv = [
            header(),
            row(['MatchBy Named One', 'MatchBy Named Two', 'MatchBy Legacy Three', 'MatchBy Legacy Four']),
        ].join('\n');

        const result = importService.validateGames(EVENT_ID, csv, 'name');

        expect(result.errors).toEqual([]);
    });

    it('imports games for users that have no telegramUsername', () => {
        const csv = [
            header(),
            row(['MatchBy Named One', 'MatchBy Named Two', 'MatchBy Legacy Three', 'MatchBy Legacy Four']),
        ].join('\n');

        const result = importService.importGames(EVENT_ID, csv, 0, 'name');

        expect(result.errors).toEqual([]);
        expect(result.imported).toBe(1);

        const importedUserIds = dbManager.db.prepare(
            `SELECT utg.userId FROM userToGame utg
             JOIN game g ON g.id = utg.gameId
             WHERE g.eventId = ?`
        ).all(EVENT_ID).map((r: any) => r.userId);

        expect(importedUserIds).toEqual(
            expect.arrayContaining(WITHOUT_USERNAME.map(u => u.id))
        );
    });

    it('reports a missing name in name mode', () => {
        const csv = [
            header(),
            row(['MatchBy Named One', 'MatchBy Named Two', 'MatchBy Legacy Three', 'Nobody At All']),
        ].join('\n');

        const result = importService.validateGames(EVENT_ID, csv, 'name');

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]!.message).toContain('Nobody At All');
    });
});
