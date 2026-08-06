import { unlinkSync, existsSync } from 'fs';

/**
 * Test environment setup
 * This file runs before any test imports to ensure proper database configuration
 */

const TEST_DB_PATH = './db/data/test.db';

/**
 * Delete the test database files.
 *
 * All suites share one process and one `dbManager` singleton under `--runInBand`, so
 * deleting the file without reopening it leaves every later suite pointing at a database
 * that no longer exists. Suites should call `resetTestDatabase()` from `testHelpers.ts`
 * in `afterAll` instead of calling this directly; it rebuilds an empty, migrated database
 * so the shared handle stays valid for whichever suite runs next.
 */
function cleanupTestDatabase() {
    const filesToClean = [
        TEST_DB_PATH,
        `${TEST_DB_PATH}-wal`,
        `${TEST_DB_PATH}-shm`,
    ];

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
