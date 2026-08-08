import Database from 'better-sqlite3';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
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

const NOW = '2026-07-19T00:00:00.000Z';

describe('migration 012: club achievement catalog', () => {
    let db: BetterSqlite3Database;

    beforeEach(() => {
        db = createMigratedDb(12);
        db.pragma('foreign_keys = ON');
        db.prepare(`
            INSERT INTO user (id, name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
            VALUES (10, 'Owner', 'owner', 10, ?, ?, 0, 1, 0, 'ACTIVE'),
                   (11, 'Member', 'member', 11, ?, ?, 0, 1, 0, 'ACTIVE')
        `).run(NOW, NOW, NOW, NOW);
    });

    afterEach(() => {
        db.close();
    });

    function insertDefinition(overrides: Partial<{ clubId: number, name: string, archivedAt: string | null }> = {}) {
        const clubId = overrides.clubId ?? 1;
        const name = overrides.name ?? 'Community Builder';
        const archivedAt = overrides.archivedAt ?? null;
        return db.prepare(`
            INSERT INTO clubAchievementDefinition
                (clubId, name, description, icon, archivedAt, createdAt, createdBy, modifiedAt, modifiedBy)
            VALUES (?, ?, 'desc', NULL, ?, ?, 10, ?, 10)
        `).run(clubId, name, archivedAt, NOW, NOW).lastInsertRowid as number;
    }

    it('creates a custom definition and enforces case-insensitive unique active names per club', () => {
        insertDefinition({ name: 'Community Builder' });

        expect(() => insertDefinition({ name: 'community builder' })).toThrow();

        // A different club can reuse the same name.
        db.prepare(
            `INSERT INTO club (id, name, isActive, createdAt, modifiedAt, modifiedBy) VALUES (2, 'Other Club', 1, ?, ?, 0)`
        )
            .run(NOW, NOW);
        expect(() => insertDefinition({ clubId: 2, name: 'Community Builder' })).not.toThrow();
    });

    it('frees the name for reuse once the definition is archived', () => {
        const id = insertDefinition({ name: 'Mentor' });
        db.prepare(`UPDATE clubAchievementDefinition SET archivedAt = ?, archivedBy = 10 WHERE id = ?`).run(NOW, id);

        expect(() => insertDefinition({ name: 'Mentor' })).not.toThrow();
    });

    it('requires exactly one of builtInCode or definitionId on an assignment', () => {
        const definitionId = insertDefinition();

        expect(() =>
            db.prepare(`
                INSERT INTO clubUserAchievement (clubId, userId, builtInCode, definitionId, awardedAt, awardedBy)
                VALUES (1, 11, NULL, NULL, ?, 10)
            `).run(NOW)
        ).toThrow();

        expect(() =>
            db.prepare(`
                INSERT INTO clubUserAchievement (clubId, userId, builtInCode, definitionId, awardedAt, awardedBy)
                VALUES (1, 11, 'MENTOR', ?, ?, 10)
            `).run(definitionId, NOW)
        ).toThrow();

        expect(() =>
            db.prepare(`
                INSERT INTO clubUserAchievement (clubId, userId, builtInCode, definitionId, awardedAt, awardedBy)
                VALUES (1, 11, 'MENTOR', NULL, ?, 10)
            `).run(NOW)
        ).not.toThrow();
    });

    it('allows only one active assignment per club/user/definition, for each source independently', () => {
        db.prepare(`
            INSERT INTO clubUserAchievement (clubId, userId, builtInCode, definitionId, awardedAt, awardedBy)
            VALUES (1, 11, 'MENTOR', NULL, ?, 10)
        `).run(NOW);

        expect(() =>
            db.prepare(`
                INSERT INTO clubUserAchievement (clubId, userId, builtInCode, definitionId, awardedAt, awardedBy)
                VALUES (1, 11, 'MENTOR', NULL, ?, 10)
            `).run(NOW)
        ).toThrow();

        const definitionId = insertDefinition({ name: 'Rising Star' });
        db.prepare(`
            INSERT INTO clubUserAchievement (clubId, userId, builtInCode, definitionId, awardedAt, awardedBy)
            VALUES (1, 11, NULL, ?, ?, 10)
        `).run(definitionId, NOW);

        expect(() =>
            db.prepare(`
                INSERT INTO clubUserAchievement (clubId, userId, builtInCode, definitionId, awardedAt, awardedBy)
                VALUES (1, 11, NULL, ?, ?, 10)
            `).run(definitionId, NOW)
        ).toThrow();
    });

    it('allows a new active assignment once the prior one is revoked', () => {
        const id = db.prepare(`
            INSERT INTO clubUserAchievement (clubId, userId, builtInCode, definitionId, awardedAt, awardedBy)
            VALUES (1, 11, 'MENTOR', NULL, ?, 10)
        `).run(NOW).lastInsertRowid as number;

        db.prepare(`UPDATE clubUserAchievement SET revokedAt = ?, revokedBy = 10 WHERE id = ?`).run(NOW, id);

        expect(() =>
            db.prepare(`
                INSERT INTO clubUserAchievement (clubId, userId, builtInCode, definitionId, awardedAt, awardedBy)
                VALUES (1, 11, 'MENTOR', NULL, ?, 10)
            `).run(NOW)
        ).not.toThrow();
    });
});
