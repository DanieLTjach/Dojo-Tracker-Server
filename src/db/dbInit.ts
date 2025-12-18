import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3'
import config from '../../config/config.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.dirname(config.db_path);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(config.db_path);

function getCurrentDBVersion(): number {
    const result = db.pragma('user_version', { simple: true });
    if (typeof result !== 'number') {
        throw new Error('Failed to get database version');
    }
    return result;
}

function setDBVersion(version: number) {
    db.pragma(`user_version = ${version}`);
}

function runSqlFile(filePath: string) {
    const sql = fs.readFileSync(filePath, 'utf8');

    db.transaction(() => {
        db.exec(sql);
    })();
}

function getMigrationFiles() {
    const migrationsDir = path.join(__dirname, '../../db/migrations');

    if (!fs.existsSync(migrationsDir)) {
        return [];
    }

    const files = fs.readdirSync(migrationsDir)
        .filter(file => file.match(/^\d+\.sql$/))
        .sort((a, b) => {
            const numA = parseInt(a.split('.')[0]!);
            const numB = parseInt(b.split('.')[0]!);
            return numA - numB;
        });

    return files;
}

function runMigrations() {
    const currentVersion = getCurrentDBVersion();
    const migrationFiles = getMigrationFiles();
    const migrationsDir = path.join(__dirname, '../../db/migrations');

    console.log(`Database version: ${currentVersion}`);

    let migrationsRun = 0;

    for (const file of migrationFiles) {
        const migrationNumber = parseInt(file.split('.')[0]!);

        if (migrationNumber > currentVersion) {
            const filePath = path.join(migrationsDir, file);
            console.log(`Running migration: ${file}`);

            try {
                runSqlFile(filePath);
                setDBVersion(migrationNumber);
                console.log(`✓ Migration ${file} completed`);
                migrationsRun++;
            } catch (error) {
                console.error(`✗ Migration ${file} failed: `, error);
                throw error;
            }
        }
    }

    if (migrationsRun > 0) {
        const finalVersion = getCurrentDBVersion();
        console.log(`Database updated to version: ${finalVersion}`);
    } else {
        console.log('Database is up to date');
    }
}

function initDB() {
    try {
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        runMigrations();
    } catch (error) {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    }
}

initDB();