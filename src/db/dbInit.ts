import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import type { Database as BetterSqlite3Database } from 'better-sqlite3';
import config from '../../config/config.ts';
import { getMigrationFiles } from './MigrationFiles.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

class DBManager {
    db: BetterSqlite3Database = new Database(config.dbPath);

    constructor() {
        this.initDB();
    }

    initDB() {
        try {
            this.db.pragma('journal_mode = WAL');
            this.db.pragma('foreign_keys = OFF');
            this.runMigrations();
            this.db.pragma('foreign_keys = ON');
        } catch (error) {
            console.error('Failed to initialize database:', error);
            this.closeDB();
            throw error;
        }
    }

    reinitDB() {
        this.db = new Database(config.dbPath);
        this.initDB();
    }

    closeDB() {
        this.db.close();
    }

    runMigrations() {
        const currentVersion = this.getCurrentDBVersion();
        const migrationsDir = path.join(__dirname, '../../db/migrations');
        const migrationFiles = getMigrationFiles(migrationsDir);

        console.log(`Database version: ${currentVersion}`);

        let migrationsRun = 0;

        for (const migration of migrationFiles) {
            if (migration.version > currentVersion) {
                console.log(`Running migration: ${migration.fileName}`);

                try {
                    this.db.transaction(() => {
                        this.runSqlFile(migration.path);
                        this.validateForeignKeyConstraints();
                        this.setDBVersion(migration.version);
                    })();
                    console.log(`✓ Migration ${migration.fileName} completed`);
                    migrationsRun++;
                } catch (error) {
                    console.error(`✗ Migration ${migration.fileName} failed: `, error);
                    throw error;
                }
            }
        }

        if (migrationsRun > 0) {
            const finalVersion = this.getCurrentDBVersion();
            console.log(`Database updated to version: ${finalVersion}`);
        } else {
            console.log('Database is up to date');
        }
    }

    private getCurrentDBVersion(): number {
        const result = this.db.pragma('user_version', { simple: true });
        if (typeof result !== 'number') {
            throw new Error('Failed to get database version');
        }
        return result;
    }

    private setDBVersion(version: number) {
        this.db.pragma(`user_version = ${version}`);
    }

    private runSqlFile(filePath: string) {
        const sql = fs.readFileSync(filePath, 'utf8');
        this.db.exec(sql);
    }

    private validateForeignKeyConstraints() {
        const result = this.db.pragma('foreign_key_check', { simple: false }) as unknown[];
        if (result.length > 0) {
            throw new Error('Foreign key constraint violations found: ' + JSON.stringify(result));
        }
    }
}

export const dbManager = new DBManager();
