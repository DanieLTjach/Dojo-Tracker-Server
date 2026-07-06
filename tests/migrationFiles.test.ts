import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getMigrationFiles, parseMigrationFileName } from '../src/db/MigrationFiles.ts';

function withTempMigrations<T>(fileNames: string[], callback: (migrationsDir: string) => T): T {
    const migrationsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dojo-migrations-'));

    try {
        for (const fileName of fileNames) {
            fs.writeFileSync(path.join(migrationsDir, fileName), '');
        }

        return callback(migrationsDir);
    } finally {
        fs.rmSync(migrationsDir, { recursive: true, force: true });
    }
}

describe('Migration file parsing', () => {
    test('parses zero-padded version and description', () => {
        const migration = parseMigrationFileName('001_initial_schema.sql', '/tmp/migrations');

        expect(migration).toEqual({
            version: 1,
            description: 'initial_schema',
            fileName: '001_initial_schema.sql',
            path: path.join('/tmp/migrations', '001_initial_schema.sql'),
        });
    });

    test('sorts migration files by numeric version', () => {
        const fileNames = [
            '010_migration_10.sql',
            '001_migration_1.sql',
            '009_migration_9.sql',
            '003_migration_3.sql',
            '002_migration_2.sql',
            '008_migration_8.sql',
            '004_migration_4.sql',
            '007_migration_7.sql',
            '005_migration_5.sql',
            '006_migration_6.sql',
            'README.md',
        ];

        withTempMigrations(fileNames, migrationsDir => {
            const migrations = getMigrationFiles(migrationsDir);

            expect(migrations.map(migration => migration.fileName)).toEqual([
                '001_migration_1.sql',
                '002_migration_2.sql',
                '003_migration_3.sql',
                '004_migration_4.sql',
                '005_migration_5.sql',
                '006_migration_6.sql',
                '007_migration_7.sql',
                '008_migration_8.sql',
                '009_migration_9.sql',
                '010_migration_10.sql',
            ]);
        });
    });

    test('rejects duplicate migration versions', () => {
        withTempMigrations(['001_initial_schema.sql', '001_duplicate_initial_schema.sql'], migrationsDir => {
            expect(() => getMigrationFiles(migrationsDir)).toThrow(/Duplicate migration version 1:/);
        });
    });

    test('rejects missing migration versions', () => {
        withTempMigrations(['001_initial_schema.sql', '003_add_profiles.sql'], migrationsDir => {
            expect(() => getMigrationFiles(migrationsDir)).toThrow(
                'Missing migration version 2. Found 003_add_profiles.sql with version 3'
            );
        });
    });

    test('rejects bare numeric SQL filenames', () => {
        withTempMigrations(['1.sql'], migrationsDir => {
            expect(() => getMigrationFiles(migrationsDir)).toThrow(
                'Invalid migration filename "1.sql". Expected format: NNN_description.sql'
            );
        });
    });
});
