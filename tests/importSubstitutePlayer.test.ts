import { dbManager } from '../src/db/dbInit.ts';
import { createCustomEvent, deleteEventById, openEventWindow } from './testHelpers.ts';
import { ImportService } from '../src/service/ImportService.ts';

const EVENT_ID = 99400;
const GAME_RULES_ID = 2; // yonma, startingPoints 30000
const TEST_CLUB_ID = 1;

const PLAYERS = [
    { id: 99401, name: 'Substitute Import One' },
    { id: 99402, name: 'Substitute Import Two' },
    { id: 99403, name: 'Substitute Import Three' },
    { id: 99404, name: 'Substitute Import Filler' },
];

/** Header without the optional substitute column — the pre-existing CSV shape. */
function baseHeader(): string {
    const cols: string[] = [];
    for (let p = 1; p <= 4; p++) {
        cols.push(`player${p}_username`, `player${p}_points`, `player${p}_startPlace`, `player${p}_chombo`);
    }
    return cols.join(',');
}

/** Header including the optional substitute column. */
function substituteHeader(): string {
    const cols: string[] = [];
    for (let p = 1; p <= 4; p++) {
        cols.push(
            `player${p}_username`,
            `player${p}_points`,
            `player${p}_startPlace`,
            `player${p}_chombo`,
            `player${p}_isSubstitutePlayer`
        );
    }
    return cols.join(',');
}

function baseRow(): string {
    const points = [40000, 30000, 30000, 20000];
    const winds = ['EAST', 'SOUTH', 'WEST', 'NORTH'];
    const cells: string[] = [];
    for (let i = 0; i < 4; i++) {
        cells.push(PLAYERS[i]!.name, String(points[i]), winds[i]!, '0');
    }
    return cells.join(',');
}

/** Marks the 4th seat as the substitute. Points still sum to 120000. */
function substituteRow(flags: string[]): string {
    const points = [40000, 30000, 30000, 20000];
    const winds = ['EAST', 'SOUTH', 'WEST', 'NORTH'];
    const cells: string[] = [];
    for (let i = 0; i < 4; i++) {
        cells.push(PLAYERS[i]!.name, String(points[i]), winds[i]!, '0', flags[i]!);
    }
    return cells.join(',');
}

describe('ImportService isSubstitutePlayer column', () => {
    const importService = new ImportService();

    beforeAll(() => {
        const ts = '2024-01-01T00:00:00.000Z';
        for (const u of PLAYERS) {
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, NULL, NULL, 0, 1, 'ACTIVE', ?, ?, 0)`
            ).run(u.id, u.name, ts, ts);
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, 'MEMBER', 'ACTIVE', ?, ?, 0)`
            ).run(TEST_CLUB_ID, u.id, ts, ts);
        }

        createCustomEvent(
            EVENT_ID,
            'Substitute Import Season',
            openEventWindow().dateFrom,
            openEventWindow().dateTo,
            GAME_RULES_ID,
            TEST_CLUB_ID,
            'SEASON'
        );
    });

    afterEach(() => {
        dbManager.db.prepare(
            'DELETE FROM userRatingChange WHERE gameId IN (SELECT id FROM game WHERE eventId = ?)'
        ).run(EVENT_ID);
        dbManager.db.prepare(
            'DELETE FROM userToGame WHERE gameId IN (SELECT id FROM game WHERE eventId = ?)'
        ).run(EVENT_ID);
        dbManager.db.prepare('DELETE FROM game WHERE eventId = ?').run(EVENT_ID);
    });

    afterAll(() => {
        deleteEventById(EVENT_ID);
    });

    it('imports CSVs without the column, defaulting every seat to not-substitute', () => {
        const csv = [baseHeader(), baseRow()].join('\n');

        const result = importService.importGames(EVENT_ID, csv, 0, 'name');

        expect(result.errors).toEqual([]);
        expect(result.imported).toBe(1);

        const flags = dbManager.db.prepare(
            `SELECT isSubstitutePlayer FROM userToGame utg
             JOIN game g ON g.id = utg.gameId WHERE g.eventId = ?`
        ).all(EVENT_ID) as Array<{ isSubstitutePlayer: number }>;
        expect(flags).toHaveLength(4);
        expect(flags.every(f => f.isSubstitutePlayer === 0)).toBe(true);
    });

    it('persists the substitute flag for the marked seat only', () => {
        const csv = [substituteHeader(), substituteRow(['0', '0', '0', '1'])].join('\n');

        const result = importService.importGames(EVENT_ID, csv, 0, 'name');

        expect(result.errors).toEqual([]);
        expect(result.imported).toBe(1);

        const rows = dbManager.db.prepare(
            `SELECT utg.userId, utg.isSubstitutePlayer FROM userToGame utg
             JOIN game g ON g.id = utg.gameId WHERE g.eventId = ?`
        ).all(EVENT_ID) as Array<{ userId: number, isSubstitutePlayer: number }>;

        const substitutes = rows.filter(r => r.isSubstitutePlayer === 1);
        expect(substitutes).toHaveLength(1);
        expect(substitutes[0]!.userId).toBe(PLAYERS[3]!.id);
    });

    it.each([['true'], ['TRUE'], ['yes'], ['1']])('accepts %s as truthy', flag => {
        const csv = [substituteHeader(), substituteRow(['0', '0', '0', flag])].join('\n');

        const result = importService.importGames(EVENT_ID, csv, 0, 'name');

        expect(result.errors).toEqual([]);
        const count = dbManager.db.prepare(
            `SELECT COUNT(*) c FROM userToGame utg JOIN game g ON g.id = utg.gameId
             WHERE g.eventId = ? AND utg.isSubstitutePlayer = 1`
        ).get(EVENT_ID) as { c: number };
        expect(count.c).toBe(1);
    });

    it.each([['false'], ['no'], ['0'], ['']])('accepts %s as falsy', flag => {
        const csv = [substituteHeader(), substituteRow(['0', '0', '0', flag])].join('\n');

        const result = importService.importGames(EVENT_ID, csv, 0, 'name');

        expect(result.errors).toEqual([]);
        const count = dbManager.db.prepare(
            `SELECT COUNT(*) c FROM userToGame utg JOIN game g ON g.id = utg.gameId
             WHERE g.eventId = ? AND utg.isSubstitutePlayer = 1`
        ).get(EVENT_ID) as { c: number };
        expect(count.c).toBe(0);
    });

    it('rejects an unrecognised value instead of silently treating it as false', () => {
        const csv = [substituteHeader(), substituteRow(['0', '0', '0', 'maybe'])].join('\n');

        const result = importService.validateGames(EVENT_ID, csv, 'name');

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]!.message).toContain('isSubstitutePlayer');
    });

    it('still enforces the point-sum rule when a substitute is present', () => {
        const header = substituteHeader();
        const winds = ['EAST', 'SOUTH', 'WEST', 'NORTH'];
        const badPoints = [40000, 30000, 30000, 19000]; // sums to 119000, not 120000
        const cells: string[] = [];
        for (let i = 0; i < 4; i++) {
            cells.push(PLAYERS[i]!.name, String(badPoints[i]), winds[i]!, '0', i === 3 ? '1' : '0');
        }

        const result = importService.validateGames(EVENT_ID, [header, cells.join(',')].join('\n'), 'name');

        expect(result.errors).toHaveLength(1);
    });
});
