import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import config from '../../config/config.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.dirname(config.db_path);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(config.db_path);

function getCurrentDBVersion() {
    return new Promise((resolve, reject) => {
        db.get('PRAGMA user_version', (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row.user_version);
            }
        });
    });
}

function setDBVersion(version) {
    return new Promise((resolve, reject) => {
        db.exec(`PRAGMA user_version = ${version}`, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function runSqlFile(filePath) {
    return new Promise((resolve, reject) => {
        const sql = fs.readFileSync(filePath, 'utf8');
        db.exec(sql, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function getMigrationFiles() {
    const migrationsDir = path.join(__dirname, '../../db/migrations');
    
    if (!fs.existsSync(migrationsDir)) {
        return [];
    }
    
    const files = fs.readdirSync(migrationsDir)
        .filter(file => file.match(/^\d+\.sql$/))
        .sort((a, b) => {
            const numA = parseInt(a.split('.')[0]);
            const numB = parseInt(b.split('.')[0]);
            return numA - numB;
        });
    
    return files;
}

async function runMigrations() {
    const currentVersion = await getCurrentDBVersion();
    const migrationFiles = getMigrationFiles();
    const migrationsDir = path.join(__dirname, '../../db/migrations');
    
    console.log(`Database version: ${currentVersion}`);
    
    let migrationsRun = 0;
    
    for (const file of migrationFiles) {
        const migrationNumber = parseInt(file.split('.')[0]);
        
        if (migrationNumber > currentVersion) {
            const filePath = path.join(migrationsDir, file);
            console.log(`Running migration: ${file}`);
            
            try {
                await runSqlFile(filePath);
                await setDBVersion(migrationNumber);
                console.log(`✓ Migration ${file} completed`);
                migrationsRun++;
            } catch (error) {
                console.error(`✗ Migration ${file} failed:`, error.message);
                throw error;
            }
        }
    }
    
    if (migrationsRun > 0) {
        const finalVersion = await getCurrentDBVersion();
        console.log(`Database updated to version: ${finalVersion}`);
    } else {
        console.log('Database is up to date');
    }
}

async function enableForeignKeys() {
    return new Promise((resolve, reject) => {
        db.run(`PRAGMA foreign_keys = ON;`, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

async function initDB() {
    try {
        await enableForeignKeys();
        await runMigrations();
    } catch (error) {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    }
}

initDB();

export default db;