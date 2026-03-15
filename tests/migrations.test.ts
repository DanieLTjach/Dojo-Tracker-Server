import Database from 'better-sqlite3';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');

function getMigrationFiles() {
  return fs.readdirSync(migrationsDir)
    .filter(file => file.match(/^\d+\.sql$/))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
}

function runMigration(db: BetterSqlite3Database, fileName: string) {
  const filePath = path.join(migrationsDir, fileName);
  const sql = fs.readFileSync(filePath, 'utf-8');
  db.exec(sql);
}

function createMigratedDb(lastMigrationFile: string) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');

  for (const file of getMigrationFiles()) {
    runMigration(db, file);
    if (file === lastMigrationFile) {
      break;
    }
  }

  return db;
}

describe('Database Migrations', () => {
  test('migration files should not contain CURRENT_TIMESTAMP', () => {
    const sqlFiles = getMigrationFiles();

    expect(sqlFiles.length).toBeGreaterThan(0);

    const filesWithCurrentTimestamp = sqlFiles.filter(file => {
      const filePath = path.join(migrationsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      return content.includes('CURRENT_TIMESTAMP');
    });

    expect(filesWithCurrentTimestamp).toEqual([]);
  });

  test('migration 4 creates club schema and migrates existing data into Japan Dojo', () => {
    const db = createMigratedDb('3.sql');

    db.prepare(`
      INSERT INTO user (id, name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
      VALUES
        (5, 'Admin User', 'admin_user', 5, '2026-02-05T00:00:00.000Z', '2026-02-05T00:00:00.000Z', 0, 1, 1, 'ACTIVE'),
        (18, 'Inactive User', 'inactive_user', 18, '2026-02-18T00:00:00.000Z', '2026-02-18T00:00:00.000Z', 0, 0, 0, 'INACTIVE'),
        (19, 'Pending User', 'pending_user', 19, '2026-02-19T00:00:00.000Z', '2026-02-19T00:00:00.000Z', 0, 1, 0, 'PENDING'),
        (42, 'Second Admin', 'second_admin', 42, '2026-02-20T00:00:00.000Z', '2026-02-20T00:00:00.000Z', 0, 1, 1, 'ACTIVE')
    `).run();

    runMigration(db, '4.sql');
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
      ratingChatId: null,
      ratingTopicId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-01T00:00:00.000Z',
      modifiedBy: 0,
    });

    const clubColumns = (db.prepare('PRAGMA table_info(club)').all() as Array<{ name: string; type: string; notnull: number; dflt_value: string | null }>).map(({ name, type, notnull, dflt_value }) => ({
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
      { name: 'isActive', type: 'BOOL', notnull: 1, dflt_value: '1' },
      { name: 'ratingChatId', type: 'TEXT', notnull: 0, dflt_value: null },
      { name: 'ratingTopicId', type: 'TEXT', notnull: 0, dflt_value: null },
      { name: 'createdAt', type: 'TIMESTAMP', notnull: 1, dflt_value: null },
      { name: 'modifiedAt', type: 'TIMESTAMP', notnull: 1, dflt_value: null },
      { name: 'modifiedBy', type: 'INTEGER', notnull: 1, dflt_value: null },
    ]);

    const roles = db.prepare('SELECT role FROM clubRole ORDER BY role').all() as Array<{ role: string }>;
    expect(roles.map(({ role }) => role)).toEqual(['MEMBER', 'MODERATOR', 'OWNER']);

    const statuses = db.prepare('SELECT status FROM clubMembershipStatus ORDER BY status').all() as Array<{ status: string }>;
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

    const eventClubStats = db.prepare('SELECT COUNT(*) AS totalCount, COUNT(clubId) AS linkedCount, MIN(clubId) AS minClubId, MAX(clubId) AS maxClubId FROM event').get() as Record<string, number>;
    expect(eventClubStats).toEqual({ totalCount: 5, linkedCount: 5, minClubId: 1, maxClubId: 1 });

    const gameRulesClubStats = db.prepare('SELECT COUNT(*) AS totalCount, COUNT(clubId) AS linkedCount, MIN(clubId) AS minClubId, MAX(clubId) AS maxClubId FROM gameRules').get() as Record<string, number>;
    expect(gameRulesClubStats).toEqual({ totalCount: 4, linkedCount: 4, minClubId: 1, maxClubId: 1 });

    const eventColumns = db.prepare('PRAGMA table_info(event)').all() as Array<{ name: string; notnull: number }>;
    const gameRulesColumns = db.prepare('PRAGMA table_info(gameRules)').all() as Array<{ name: string; notnull: number }>;
    expect(eventColumns.find(column => column.name === 'clubId')).toMatchObject({ name: 'clubId', notnull: 0 });
    expect(gameRulesColumns.find(column => column.name === 'clubId')).toMatchObject({ name: 'clubId', notnull: 0 });

    const foreignKeyViolations = db.pragma('foreign_key_check') as unknown[];
    expect(foreignKeyViolations).toEqual([]);

    db.close();
  });
});
