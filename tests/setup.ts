import { unlinkSync, existsSync } from 'fs';

/**
 * Test environment setup
 * This file runs before any test imports to ensure proper database configuration
 */

const TEST_DB_PATH = './db/data/test.db';

/**
 * Clean up any existing test database files from previous runs
 */
function cleanupTestDatabase() {
    const filesToClean = [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`];

    filesToClean.forEach(file => {
        if (existsSync(file)) {
            unlinkSync(file);
        }
    });
}

// Clean up before tests start
cleanupTestDatabase();

// Set test database path (will be picked up by .env.test via dotenv-cli)
// This is a fallback in case the environment variable isn't set
if (!process.env['DB_PATH']) {
    process.env['DB_PATH'] = TEST_DB_PATH;
}

export { TEST_DB_PATH, cleanupTestDatabase };
