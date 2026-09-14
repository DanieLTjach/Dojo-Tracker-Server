import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getMigrationFiles } from '../src/db/MigrationFiles.ts';
import { findImageColumns } from '../src/util/StorageColumnUtil.ts';

const testFilePath = fileURLToPath(import.meta.url);
const migrationsDir = path.join(path.dirname(testFilePath), '..', 'db', 'migrations');

function createMigratedDb() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = OFF');
    for (const migration of getMigrationFiles(migrationsDir)) {
        db.exec(fs.readFileSync(migration.path, 'utf-8'));
    }
    return db;
}

/**
 * The orphan cleanup treats "no row references this object" as permission to
 * delete, so a column it fails to scan gets its images deleted while they are
 * still in use. Discovery is derived from the schema to prevent that; these
 * tests pin the behaviour.
 */
describe('findImageColumns', () => {
    test('finds every known image column in the fully migrated schema', () => {
        const db = createMigratedDb();
        const found = findImageColumns(db).map(c => `${c.table}.${c.column}`);

        // An assertion, not the input. If discovery ever stops finding one of
        // these, the cleanup would begin deleting images that are still in use.
        expect(found).toEqual(
            expect.arrayContaining([
                'profile.avatarUrl',
                'club.logoUrl',
                'post_image.url',
                'clubAchievementDefinition.icon',
            ])
        );

        db.close();
    });

    test('picks up a newly added image column with no code change', () => {
        const db = new Database(':memory:');
        db.exec('CREATE TABLE tournamentBanner (id INTEGER PRIMARY KEY, bannerImageUrl TEXT)');

        expect(findImageColumns(db).map(c => `${c.table}.${c.column}`))
            .toContain('tournamentBanner.bannerImageUrl');

        db.close();
    });

    test('matches every naming variant already used in the schema', () => {
        const db = new Database(':memory:');
        db.exec(`
            CREATE TABLE a (avatarUrl TEXT);
            CREATE TABLE b (logoUrl TEXT);
            CREATE TABLE c (icon TEXT);
            CREATE TABLE d (url TEXT);
            CREATE TABLE e (imageSrc TEXT);
            CREATE TABLE f (photoUrl TEXT);
        `);

        expect(findImageColumns(db).map(c => c.table))
            .toEqual(expect.arrayContaining(['a', 'b', 'c', 'd', 'e', 'f']));

        db.close();
    });

    test('is case insensitive about the column name', () => {
        const db = new Database(':memory:');
        db.exec('CREATE TABLE weird (BannerIMAGE TEXT)');

        expect(findImageColumns(db).map(c => c.column)).toContain('BannerIMAGE');

        db.close();
    });

    test('ignores non-text columns and unrelated names', () => {
        const db = new Database(':memory:');
        db.exec(`
            CREATE TABLE t (
                id INTEGER PRIMARY KEY,
                imageCount INTEGER,
                name TEXT,
                createdAt TEXT
            )
        `);

        expect(findImageColumns(db)).toEqual([]);

        db.close();
    });

    test('skips sqlite internal tables', () => {
        const db = createMigratedDb();

        expect(findImageColumns(db).every(c => !c.table.startsWith('sqlite_'))).toBe(true);

        db.close();
    });
});
