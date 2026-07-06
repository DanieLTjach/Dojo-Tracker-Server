import Database from 'better-sqlite3';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { gameRulesDetailsSchema } from '../src/schema/GameRulesSchemas.ts';
import { parseGameRulesDetailsAndApplyPresets } from '../src/util/GameRulesDetailsUtil.ts';
import { getMigrationFiles, type MigrationFile } from '../src/db/MigrationFiles.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');

function getMigrationFile(version: number) {
    const migration = getMigrationFiles(migrationsDir).find(file => file.version === version);
    if (migration === undefined) {
        throw new Error(`Migration ${version} not found`);
    }

    return migration;
}

function runMigration(db: BetterSqlite3Database, migration: MigrationFile | number) {
    const migrationFile = typeof migration === 'number' ? getMigrationFile(migration) : migration;
    const sql = fs.readFileSync(migrationFile.path, 'utf-8');
    db.exec(sql);
}

function createMigratedDb(lastMigrationVersion: number) {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');

    for (const migration of getMigrationFiles(migrationsDir)) {
        runMigration(db, migration);
        if (migration.version === lastMigrationVersion) {
            break;
        }
    }

    return db;
}

describe('Database Migrations', () => {
    test('migration files should not contain CURRENT_TIMESTAMP', () => {
        const sqlFiles = getMigrationFiles(migrationsDir);

        expect(sqlFiles.length).toBeGreaterThan(0);

        const filesWithCurrentTimestamp = sqlFiles.filter(file => {
            const content = fs.readFileSync(file.path, 'utf-8');
            return content.includes('CURRENT_TIMESTAMP');
        });

        expect(filesWithCurrentTimestamp).toEqual([]);
    });

    test('migration 4 creates club schema and migrates existing data into Japan Dojo', () => {
        const db = createMigratedDb(3);

        db.prepare(`
      INSERT INTO user (id, name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
      VALUES
        (5, 'Admin User', 'admin_user', 5, '2026-02-05T00:00:00.000Z', '2026-02-05T00:00:00.000Z', 0, 1, 1, 'ACTIVE'),
        (18, 'Inactive User', 'inactive_user', 18, '2026-02-18T00:00:00.000Z', '2026-02-18T00:00:00.000Z', 0, 0, 0, 'INACTIVE'),
        (19, 'Pending User', 'pending_user', 19, '2026-02-19T00:00:00.000Z', '2026-02-19T00:00:00.000Z', 0, 1, 0, 'PENDING'),
        (42, 'Second Admin', 'second_admin', 42, '2026-02-20T00:00:00.000Z', '2026-02-20T00:00:00.000Z', 0, 1, 1, 'ACTIVE')
    `).run();

        runMigration(db, 4);
        db.pragma('foreign_keys = ON');

        const club = db.prepare('SELECT * FROM club WHERE id = 1').get() as Record<string, unknown>;
        expect(club).toEqual({
            id: 1,
            name: 'Japan Dojo',
            address: null,
            city: null,
            description: null,
            contactInfo: null,
            isActive: 1,
            currentRatingEventId: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            modifiedAt: '2026-01-01T00:00:00.000Z',
            modifiedBy: 0,
        });

        const clubColumns = (db.prepare('PRAGMA table_info(club)').all() as Array<
            { name: string, type: string, notnull: number, dflt_value: string | null }
        >).map(({ name, type, notnull, dflt_value }) => ({
            name,
            type,
            notnull,
            dflt_value,
        }));
        expect(clubColumns).toEqual([
            { name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null },
            { name: 'name', type: 'TEXT', notnull: 1, dflt_value: null },
            { name: 'address', type: 'TEXT', notnull: 0, dflt_value: null },
            { name: 'city', type: 'TEXT', notnull: 0, dflt_value: null },
            { name: 'description', type: 'TEXT', notnull: 0, dflt_value: null },
            { name: 'contactInfo', type: 'TEXT', notnull: 0, dflt_value: null },
            { name: 'isActive', type: 'BOOL', notnull: 1, dflt_value: 'true' },
            { name: 'createdAt', type: 'TIMESTAMP', notnull: 1, dflt_value: null },
            { name: 'modifiedAt', type: 'TIMESTAMP', notnull: 1, dflt_value: null },
            { name: 'modifiedBy', type: 'INTEGER', notnull: 1, dflt_value: null },
            { name: 'currentRatingEventId', type: 'INTEGER', notnull: 0, dflt_value: null },
        ]);

        const roles = db.prepare('SELECT role FROM clubRole ORDER BY role').all() as Array<{ role: string }>;
        expect(roles.map(({ role }) => role)).toEqual(['MEMBER', 'MODERATOR', 'OWNER']);

        const statuses = db.prepare('SELECT status FROM clubMembershipStatus ORDER BY status').all() as Array<
            { status: string }
        >;
        expect(statuses.map(({ status }) => status)).toEqual(['ACTIVE', 'INACTIVE', 'PENDING']);

        const memberships = db.prepare(`
      SELECT userId, role, status, createdAt, modifiedAt, modifiedBy
      FROM clubMembership
      WHERE clubId = 1
      ORDER BY userId
    `).all() as Array<Record<string, unknown>>;

        expect(memberships).toHaveLength(4);
        expect(memberships).toEqual([
            {
                userId: 5,
                role: 'MODERATOR',
                status: 'ACTIVE',
                createdAt: '2026-02-05T00:00:00.000Z',
                modifiedAt: '2026-02-05T00:00:00.000Z',
                modifiedBy: 0,
            },
            {
                userId: 18,
                role: 'MEMBER',
                status: 'INACTIVE',
                createdAt: '2026-02-18T00:00:00.000Z',
                modifiedAt: '2026-02-18T00:00:00.000Z',
                modifiedBy: 0,
            },
            {
                userId: 19,
                role: 'MEMBER',
                status: 'PENDING',
                createdAt: '2026-02-19T00:00:00.000Z',
                modifiedAt: '2026-02-19T00:00:00.000Z',
                modifiedBy: 0,
            },
            {
                userId: 42,
                role: 'MODERATOR',
                status: 'ACTIVE',
                createdAt: '2026-02-20T00:00:00.000Z',
                modifiedAt: '2026-02-20T00:00:00.000Z',
                modifiedBy: 0,
            },
        ]);

        const systemMembership = db.prepare('SELECT * FROM clubMembership WHERE userId = 0').get();
        expect(systemMembership).toBeUndefined();

        const eventClubStats = db.prepare(
            'SELECT COUNT(*) AS totalCount, COUNT(clubId) AS linkedCount, MIN(clubId) AS minClubId, MAX(clubId) AS maxClubId FROM event'
        ).get() as Record<string, number>;
        expect(eventClubStats).toEqual({ totalCount: 5, linkedCount: 5, minClubId: 1, maxClubId: 1 });

        const gameRulesClubStats = db.prepare(
            'SELECT COUNT(*) AS totalCount, COUNT(clubId) AS linkedCount, MIN(clubId) AS minClubId, MAX(clubId) AS maxClubId FROM gameRules'
        ).get() as Record<string, number>;
        expect(gameRulesClubStats).toEqual({ totalCount: 6, linkedCount: 3, minClubId: 1, maxClubId: 1 });

        const clubColumnsAfterMigration = db.prepare('PRAGMA table_info(club)').all() as Array<
            { name: string, notnull: number, type?: string, dflt_value?: string | null }
        >;
        const eventColumns = db.prepare('PRAGMA table_info(event)').all() as Array<
            { name: string, notnull: number, type?: string, dflt_value?: string | null }
        >;
        const gameRulesColumns = db.prepare('PRAGMA table_info(gameRules)').all() as Array<
            { name: string, notnull: number }
        >;
        expect(eventColumns.find(column => column.name === 'clubId')).toMatchObject({ name: 'clubId', notnull: 0 });
        expect(clubColumnsAfterMigration.find(column => column.name === 'currentRatingEventId')).toMatchObject({
            name: 'currentRatingEventId',
            type: 'INTEGER',
            notnull: 0,
            dflt_value: null,
        });
        expect(gameRulesColumns.find(column => column.name === 'clubId')).toMatchObject({ name: 'clubId', notnull: 0 });

        db.prepare(`
      INSERT INTO club (id, name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
      VALUES (2, 'Test Club 2', NULL, NULL, NULL, NULL, 1, '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z', 0)
    `).run();

        db.prepare(`
      INSERT INTO event (id, name, description, type, gameRules, clubId, dateFrom, dateTo, createdAt, modifiedAt, modifiedBy)
      VALUES
        (9001, 'Current Season 1', NULL, 'SEASON', 1, 1, NULL, NULL, '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z', 0),
        (9002, 'Regular Season', NULL, 'SEASON', 1, 1, NULL, NULL, '2026-03-02T00:00:00.000Z', '2026-03-02T00:00:00.000Z', 0),
        (9003, 'Other Club Current Season', NULL, 'SEASON', 1, 2, NULL, NULL, '2026-03-03T00:00:00.000Z', '2026-03-03T00:00:00.000Z', 0)
    `).run();

        db.prepare('UPDATE club SET currentRatingEventId = ? WHERE id = ?').run(9001, 1);
        db.prepare('UPDATE club SET currentRatingEventId = ? WHERE id = ?').run(9003, 2);

        const currentRatingEventLinks = db.prepare('SELECT id, currentRatingEventId FROM club ORDER BY id')
            .all() as Array<Record<string, unknown>>;
        expect(currentRatingEventLinks).toEqual([
            { id: 1, currentRatingEventId: 9001 },
            { id: 2, currentRatingEventId: 9003 },
        ]);

        const foreignKeyViolations = db.pragma('foreign_key_check') as unknown[];
        expect(foreignKeyViolations).toEqual([]);

        db.close();
    });

    test('migration 7 renames gameStartPlace to wind and tournament columns on game', () => {
        const db = createMigratedDb(6);

        db.prepare(`
      INSERT INTO game (id, eventId, createdAt, modifiedAt, modifiedBy, tournamentHanchanNumber, tournamentTableNumber)
      VALUES (1, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 0, 2, 5)
    `).run();

        db.prepare(`
      INSERT INTO userToGame (userId, gameId, startPlace, points, chomboCount, createdAt, modifiedAt, modifiedBy)
      VALUES (0, 1, 'EAST', 30000, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 0)
    `).run();

        runMigration(db, 7);
        db.pragma('foreign_keys = ON');

        const winds = db.prepare('SELECT wind FROM wind ORDER BY wind').all() as Array<{ wind: string }>;
        expect(winds.map(({ wind }) => wind)).toEqual(['EAST', 'NORTH', 'SOUTH', 'WEST']);

        const gameStartPlaceTable = db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'gameStartPlace'
    `).get();
        expect(gameStartPlaceTable).toBeUndefined();

        const userToGame = db.prepare(`
      SELECT userId, gameId, startPlace, points, chomboCount, isSubstitutePlayer
      FROM userToGame
      WHERE userId = 0 AND gameId = 1
    `).get() as Record<string, unknown>;
        expect(userToGame).toEqual({
            userId: 0,
            gameId: 1,
            startPlace: 'EAST',
            points: 30000,
            chomboCount: 0,
            isSubstitutePlayer: 0,
        });

        const game = db.prepare(`
      SELECT tournamentRound, tournamentTable, status, startedAt, endedAt, lastRoundWasDeleted
      FROM game
      WHERE id = 1
    `).get() as Record<string, unknown>;
        expect(game).toEqual({
            tournamentRound: 2,
            tournamentTable: '5',
            status: 'FINISHED',
            startedAt: '2026-01-01T00:00:00.000Z',
            endedAt: '2026-01-01T00:00:00.000Z',
            lastRoundWasDeleted: 0,
        });

        const gameStatuses = db.prepare('SELECT status FROM gameStatus ORDER BY status').all() as Array<
            { status: string }
        >;
        expect(gameStatuses.map(({ status }) => status)).toEqual(['CREATED', 'FINISHED', 'IN_PROGRESS']);

        const eventColumns = db.prepare('PRAGMA table_info(event)').all() as Array<
            { name: string, type: string, notnull: number }
        >;
        expect(eventColumns.find(c => c.name === 'info')).toMatchObject({ name: 'info', type: 'TEXT', notnull: 0 });
        expect(eventColumns.find(c => c.name === 'blockGameCreation')).toMatchObject({
            name: 'blockGameCreation',
            type: 'BOOL',
            notnull: 1,
        });

        const gameColumns = (db.prepare('PRAGMA table_info(game)').all() as Array<{ name: string, type: string }>)
            .map(({ name, type }) => ({ name, type }));
        expect(gameColumns).toEqual(expect.arrayContaining([
            { name: 'tournamentRound', type: 'INTEGER' },
            { name: 'tournamentTable', type: 'TEXT' },
            { name: 'status', type: 'TEXT' },
            { name: 'startedAt', type: 'TIMESTAMP' },
            { name: 'endedAt', type: 'TIMESTAMP' },
            { name: 'lastRoundWasDeleted', type: 'BOOL' },
        ]));
        expect(gameColumns.find(column => column.name === 'tournamentHanchanNumber')).toBeUndefined();
        expect(gameColumns.find(column => column.name === 'tournamentTableNumber')).toBeUndefined();

        const foreignKeyViolations = db.pragma('foreign_key_check') as unknown[];
        expect(foreignKeyViolations).toEqual([]);

        db.close();
    });

    test('migration 8 creates club invite tables, enums and indexes', () => {
        const db = createMigratedDb(8);
        db.pragma('foreign_keys = ON');

        const types = db.prepare('SELECT type FROM clubInviteType ORDER BY type').all() as Array<{ type: string }>;
        expect(types.map(({ type }) => type)).toEqual(['JOIN_CLUB', 'REGISTRATION_ONLY']);

        const sources = db.prepare('SELECT source FROM clubInviteSource ORDER BY source').all() as Array<
            { source: string }
        >;
        expect(sources.map(({ source }) => source)).toEqual([
            'FESTIVAL',
            'OTHER',
            'PERSON',
            'SOCIAL_NETWORK',
            'TUTORIAL',
        ]);

        const inviteColumns = (db.prepare('PRAGMA table_info(clubInvite)').all() as Array<
            { name: string, type: string, notnull: number, dflt_value: string | null }
        >)
            .map(({ name, type, notnull, dflt_value }) => ({ name, type, notnull, dflt_value }));
        expect(inviteColumns).toEqual([
            { name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null },
            { name: 'clubId', type: 'INTEGER', notnull: 1, dflt_value: null },
            { name: 'code', type: 'TEXT', notnull: 1, dflt_value: null },
            { name: 'type', type: 'TEXT', notnull: 1, dflt_value: null },
            { name: 'source', type: 'TEXT', notnull: 1, dflt_value: null },
            { name: 'label', type: 'TEXT', notnull: 0, dflt_value: null },
            { name: 'maxUses', type: 'INTEGER', notnull: 0, dflt_value: null },
            { name: 'usesCount', type: 'INTEGER', notnull: 1, dflt_value: '0' },
            { name: 'expiresAt', type: 'TIMESTAMP', notnull: 0, dflt_value: null },
            { name: 'isActive', type: 'BOOL', notnull: 1, dflt_value: 'true' },
            { name: 'createdAt', type: 'TIMESTAMP', notnull: 1, dflt_value: null },
            { name: 'modifiedAt', type: 'TIMESTAMP', notnull: 1, dflt_value: null },
            { name: 'modifiedBy', type: 'INTEGER', notnull: 1, dflt_value: null },
        ]);

        const redemptionColumns = (db.prepare('PRAGMA table_info(clubInviteRedemption)').all() as Array<
            { name: string, notnull: number, pk: number }
        >)
            .map(({ name, notnull, pk }) => ({ name, notnull, pk }));
        expect(redemptionColumns).toEqual([
            { name: 'inviteId', notnull: 1, pk: 1 },
            { name: 'userId', notnull: 1, pk: 2 },
            { name: 'redeemedAt', notnull: 1, pk: 0 },
        ]);

        const indexes =
            (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_clubInvite%'")
                .all() as Array<{ name: string }>)
                .map(({ name }) => name)
                .sort();
        expect(indexes).toEqual(['idx_clubInviteRedemption_userId', 'idx_clubInvite_clubId']);

        const foreignKeyViolations = db.pragma('foreign_key_check') as unknown[];
        expect(foreignKeyViolations).toEqual([]);

        db.close();
    });

    test('migration 8 removes duplicate chomboPointsAfterUma from game rules', () => {
        const db = createMigratedDb(8);
        db.pragma('foreign_keys = ON');

        const gameRulesColumns =
            (db.prepare('PRAGMA table_info(gameRules)').all() as Array<{ name: string, type: string }>)
                .map(({ name, type }) => ({ name, type }));
        expect(gameRulesColumns.find(column => column.name === 'chomboPointsAfterUma')).toBeUndefined();
        expect(gameRulesColumns).toEqual(expect.arrayContaining([
            { name: 'id', type: 'INTEGER' },
            { name: 'name', type: 'TEXT' },
            { name: 'numberOfPlayers', type: 'INTEGER' },
            { name: 'uma', type: 'TEXT' },
            { name: 'startingPoints', type: 'INTEGER' },
            { name: 'clubId', type: 'INTEGER' },
            { name: 'umaTieBreak', type: 'TEXT' },
            { name: 'details', type: 'TEXT' },
        ]));

        const rows = db.prepare('SELECT id, details FROM gameRules WHERE id IN (1, 2, 3, 4, 10, 11) ORDER BY id')
            .all() as Array<{ id: number, details: string | null }>;
        for (const row of rows) {
            const details = parseGameRulesDetailsAndApplyPresets(row.details);
            expect(details?.rules.chombo).toBeDefined();
        }

        const foreignKeyViolations = db.pragma('foreign_key_check') as unknown[];
        expect(foreignKeyViolations).toEqual([]);

        db.close();
    });

    test('migration 9 creates achievement storage', () => {
        const db = createMigratedDb(9);
        db.pragma('foreign_keys = ON');

        const achievementColumns = (db.prepare('PRAGMA table_info(eventAchievement)').all() as Array<
            { name: string, type: string, notnull: number, pk: number }
        >)
            .map(({ name, type, notnull, pk }) => ({ name, type, notnull, pk }));
        expect(achievementColumns).toEqual([
            { name: 'eventId', type: 'INTEGER', notnull: 1, pk: 1 },
            { name: 'metric', type: 'TEXT', notnull: 1, pk: 2 },
            { name: 'userId', type: 'INTEGER', notnull: 1, pk: 3 },
            { name: 'value', type: 'INTEGER', notnull: 0, pk: 0 },
        ]);

        const eventColumns = db.prepare('PRAGMA table_info(event)').all() as Array<
            { name: string, type: string, notnull: number }
        >;
        expect(eventColumns.find(c => c.name === 'achievementsComputedAt')).toMatchObject({
            type: 'TIMESTAMP',
            notnull: 0,
        });

        const indexes =
            (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_eventAchievement%'")
                .all() as Array<{ name: string }>)
                .map(({ name }) => name);
        expect(indexes).toEqual(['idx_eventAchievement_userId']);

        const foreignKeyViolations = db.pragma('foreign_key_check') as unknown[];
        expect(foreignKeyViolations).toEqual([]);

        db.close();
    });

    test('migration 9 creates tournament state and backfills tournament events', () => {
        const db = createMigratedDb(8);

        db.prepare(`
      INSERT INTO event (id, name, description, type, gameRules, clubId, dateFrom, dateTo, startingRating, minimumGamesForRating, createdAt, modifiedAt, modifiedBy)
      VALUES
        (9101, 'Tournament With Games', NULL, 'TOURNAMENT', 1, 1, NULL, NULL, 0, 0, '2026-04-01T00:00:00.000Z', '2026-04-02T00:00:00.000Z', 0),
        (9102, 'Tournament Without Games', NULL, 'TOURNAMENT', 1, 1, NULL, NULL, 0, 0, '2026-04-03T00:00:00.000Z', '2026-04-04T00:00:00.000Z', 0),
        (9103, 'Regular Season', NULL, 'SEASON', 1, 1, NULL, NULL, 0, 0, '2026-04-05T00:00:00.000Z', '2026-04-06T00:00:00.000Z', 0)
    `).run();

        db.prepare(`
      INSERT INTO game (id, eventId, createdAt, modifiedAt, modifiedBy, tournamentRound, tournamentTable, status, startedAt, endedAt, lastRoundWasDeleted)
      VALUES
        (9201, 9101, '2026-04-01T10:00:00.000Z', '2026-04-01T10:00:00.000Z', 0, 1, '1', 'FINISHED', '2026-04-01T10:00:00.000Z', '2026-04-01T11:00:00.000Z', 0),
        (9202, 9101, '2026-04-01T12:00:00.000Z', '2026-04-01T12:00:00.000Z', 0, 3, '1', 'CREATED', NULL, NULL, 0),
        (9203, 9101, '2026-04-01T14:00:00.000Z', '2026-04-01T14:00:00.000Z', 0, NULL, NULL, 'FINISHED', '2026-04-01T14:00:00.000Z', '2026-04-01T15:00:00.000Z', 0)
    `).run();

        runMigration(db, 9);
        db.pragma('foreign_keys = ON');

        const statuses = db.prepare('SELECT status FROM tournamentStatus ORDER BY status').all() as Array<
            { status: string }
        >;
        expect(statuses.map(({ status }) => status)).toEqual(['CREATED', 'FINISHED', 'IN_PROGRESS', 'LAST_ROUND']);

        const tournaments = db.prepare(`
      SELECT eventId, status, currentRound, totalRounds, createdAt, modifiedAt, modifiedBy
      FROM tournament
      WHERE eventId IN (9101, 9102, 9103)
      ORDER BY eventId
    `).all() as Array<Record<string, unknown>>;

        expect(tournaments).toEqual([
            {
                eventId: 9101,
                status: 'FINISHED',
                currentRound: 3,
                totalRounds: 3,
                createdAt: '2026-04-01T00:00:00.000Z',
                modifiedAt: '2026-04-02T00:00:00.000Z',
                modifiedBy: 0,
            },
            {
                eventId: 9102,
                status: 'FINISHED',
                currentRound: null,
                totalRounds: 0,
                createdAt: '2026-04-03T00:00:00.000Z',
                modifiedAt: '2026-04-04T00:00:00.000Z',
                modifiedBy: 0,
            },
        ]);

        const tournamentColumns = (db.prepare('PRAGMA table_info(tournament)').all() as Array<
            { name: string, type: string, notnull: number, dflt_value: string | null }
        >)
            .map(({ name, type, notnull, dflt_value }) => ({ name, type, notnull, dflt_value }));
        expect(tournamentColumns).toEqual([
            { name: 'eventId', type: 'INTEGER', notnull: 1, dflt_value: null },
            { name: 'status', type: 'TEXT', notnull: 1, dflt_value: null },
            { name: 'currentRound', type: 'INTEGER', notnull: 0, dflt_value: null },
            { name: 'totalRounds', type: 'INTEGER', notnull: 1, dflt_value: null },
            { name: 'createdAt', type: 'TIMESTAMP', notnull: 1, dflt_value: null },
            { name: 'modifiedAt', type: 'TIMESTAMP', notnull: 1, dflt_value: null },
            { name: 'modifiedBy', type: 'INTEGER', notnull: 1, dflt_value: null },
        ]);

        const eventColumns = db.prepare('PRAGMA table_info(event)').all() as Array<{ name: string, type: string }>;
        const configColumn = eventColumns.find(column => column.name === 'config');
        expect(configColumn).toMatchObject({ name: 'config', type: 'TEXT' });
        expect(eventColumns.map(column => column.name)).not.toContain('maxParticipants');
        expect(eventColumns.map(column => column.name)).not.toContain('registrationDeadline');

        const foreignKeyViolations = db.pragma('foreign_key_check') as unknown[];
        expect(foreignKeyViolations).toEqual([]);

        db.close();
    });

    test('migration 9 moves legacy participant settings into event config', () => {
        const db = createMigratedDb(8);

        db.prepare(`
      INSERT INTO event (
        id, name, description, type, gameRules, clubId, dateFrom, dateTo,
        maxParticipants, registrationDeadline, startingRating, minimumGamesForRating,
        createdAt, modifiedAt, modifiedBy
      )
      VALUES
        (
          10101, 'Configured Tournament', NULL, 'TOURNAMENT', 1, 1, NULL, NULL,
          24, '2026-06-01T18:00:00.000Z', 0, 0,
          '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', 0
        ),
        (
          10102, 'Unconfigured Tournament', NULL, 'TOURNAMENT', 1, 1, NULL, NULL,
          16, NULL, 0, 0,
          '2026-05-02T00:00:00.000Z', '2026-05-02T00:00:00.000Z', 0
        ),
        (
          10103, 'Season Without Registration Settings', NULL, 'SEASON', 1, 1, NULL, NULL,
          NULL, NULL, 0, 0,
          '2026-05-03T00:00:00.000Z', '2026-05-03T00:00:00.000Z', 0
        )
    `).run();

        runMigration(db, 9);

        const rows = db.prepare(`
      SELECT id, config
      FROM event
      WHERE id IN (10101, 10102, 10103)
      ORDER BY id
    `).all() as Array<{ id: number, config: string | null }>;

        expect(rows.map(row => ({
            id: row.id,
            config: row.config === null ? null : JSON.parse(row.config),
        }))).toEqual([
            {
                id: 10101,
                config: {
                    maxParticipants: 24,
                    registrationDeadline: '2026-06-01T18:00:00.000Z',
                },
            },
            {
                id: 10102,
                config: {
                    maxParticipants: 16,
                },
            },
            {
                id: 10103,
                config: null,
            },
        ]);

        db.close();
    });

    test('migration 10 removes legacy static pairings from event info', () => {
        const db = createMigratedDb(9);

        db.prepare(`
      INSERT INTO event (id, name, type, gameRules, info, createdAt, modifiedAt, modifiedBy)
      VALUES
        (
          10201, 'Pairings And Venue', 'TOURNAMENT', 1,
          '{"venue":{"name":"Dojo"},"pairings":[[[1,2,3,4]]]}',
          '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z', 0
        ),
        (
          10202, 'Pairings Only', 'TOURNAMENT', 1,
          '{"pairings":[[[1,2,3,4]]]}',
          '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z', 0
        ),
        (
          10203, 'Venue Only', 'TOURNAMENT', 1,
          '{"venue":{"name":"Dojo"}}',
          '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z', 0
        )
    `).run();

        runMigration(db, 10);

        const rows = db.prepare(`
      SELECT id, info
      FROM event
      WHERE id IN (10201, 10202, 10203)
      ORDER BY id
    `).all() as Array<{ id: number, info: string | null }>;

        expect(rows.map(row => ({
            id: row.id,
            info: row.info === null ? null : JSON.parse(row.info),
        }))).toEqual([
            { id: 10201, info: { venue: { name: 'Dojo' } } },
            { id: 10202, info: null },
            { id: 10203, info: { venue: { name: 'Dojo' } } },
        ]);

        db.close();
    });

    test('seeded game rules details parse against the current schema after all migrations', () => {
        const db = createMigratedDb(getMigrationFiles(migrationsDir).at(-1)!.version);

        const rows = db.prepare('SELECT id, details FROM gameRules WHERE details IS NOT NULL ORDER BY id')
            .all() as Array<{ id: number, details: string }>;
        expect(rows.map(row => row.id)).toEqual([1, 2, 3, 4, 5, 6, 10, 11]);

        const parsedById = new Map<number, ReturnType<typeof gameRulesDetailsSchema.parse>>();

        for (const row of rows) {
            const details = JSON.parse(row.details);
            const result = gameRulesDetailsSchema.safeParse(details);
            expect(result.success).toBe(true);
            if (!result.success) {
                continue;
            }

            parsedById.set(row.id, result.data);
        }

        expect(parsedById.get(4)?.links).toEqual([
            {
                url: 'http://mahjong-europe.org/portal/images/docs/Riichi-rules-2025-EN.pdf',
                label: 'Riichi Rules 2025 (PDF)',
            },
        ]);
        expect(parsedById.get(5)?.links).toEqual([
            {
                url: 'https://riichi.wiki/Mahjong_Soul',
                label: 'Mahjong Soul',
            },
        ]);
        expect(parsedById.get(6)?.links).toEqual([
            {
                url: 'https://riichi.wiki/Mahjong_Soul#3P-Mahjong',
                label: 'Mahjong Soul - 3P Mahjong',
            },
        ]);

        db.close();
    });

    test('migration 10 adds team mode schema and backfills event.format', () => {
        const db = createMigratedDb(9);

        // An event created before migration 10 must keep working and default to INDIVIDUAL.
        db.prepare(`
            INSERT INTO event (id, name, description, type, gameRules, clubId, dateFrom, dateTo, startingRating, minimumGamesForRating, createdAt, modifiedAt, modifiedBy)
            VALUES (9301, 'Legacy Event', NULL, 'SEASON', 1, 1, NULL, NULL, 0, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', 0)
        `).run();

        runMigration(db, 10);
        db.pragma('foreign_keys = ON');

        // format column exists, backfilled to INDIVIDUAL.
        const event = db.prepare('SELECT format FROM event WHERE id = 9301').get() as { format: string };
        expect(event.format).toBe('INDIVIDUAL');

        // eventFormat enum is seeded.
        const formats = db.prepare('SELECT format FROM eventFormat ORDER BY format').all() as Array<{ format: string }>;
        expect(formats.map(f => f.format)).toEqual(['HYBRID', 'INDIVIDUAL', 'TEAM']);

        // DRAFT status added (additive — existing statuses preserved).
        const statuses = db.prepare('SELECT status FROM tournamentStatus ORDER BY status').all() as Array<
            { status: string }
        >;
        expect(statuses.map(s => s.status)).toEqual(['CREATED', 'DRAFT', 'FINISHED', 'IN_PROGRESS', 'LAST_ROUND']);

        // teamRole enum seeded.
        const roles = db.prepare('SELECT role FROM teamRole ORDER BY role').all() as Array<{ role: string }>;
        expect(roles.map(r => r.role)).toEqual(['CAPTAIN', 'MEMBER']);

        // team / teamMembership tables exist with the one-team-per-player-per-event constraint.
        db.prepare(`INSERT INTO team (id, eventId, name, createdAt, modifiedAt, modifiedBy)
                    VALUES (1, 9301, 'Team A', '2026-05-02T00:00:00.000Z', '2026-05-02T00:00:00.000Z', 0)`).run();
        db.prepare(`INSERT INTO team (id, eventId, name, createdAt, modifiedAt, modifiedBy)
                    VALUES (2, 9301, 'Team B', '2026-05-02T00:00:00.000Z', '2026-05-02T00:00:00.000Z', 0)`).run();
        db.prepare(`INSERT INTO teamMembership (teamId, eventId, userId, role, createdAt, modifiedAt, modifiedBy)
                    VALUES (1, 9301, 0, 'CAPTAIN', '2026-05-02T00:00:00.000Z', '2026-05-02T00:00:00.000Z', 0)`).run();
        expect(() =>
            db.prepare(`INSERT INTO teamMembership (teamId, eventId, userId, role, createdAt, modifiedAt, modifiedBy)
                        VALUES (2, 9301, 0, 'MEMBER', '2026-05-02T00:00:00.000Z', '2026-05-02T00:00:00.000Z', 0)`).run()
        ).toThrow(); // UNIQUE (eventId, userId)

        // userRatingChange gained nullable team attribution columns.
        const cols = db.prepare('PRAGMA table_info(userRatingChange)').all() as Array<{ name: string }>;
        const colNames = cols.map(c => c.name);
        expect(colNames).toContain('teamId');
        expect(colNames).toContain('teamRating');

        db.close();
    });
});
