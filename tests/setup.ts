import { unlinkSync, existsSync } from 'fs';
import type { Server } from 'net';
import { Test } from 'supertest';

/**
 * Test environment setup
 * This file runs before any test imports to ensure proper database configuration
 */

/**
 * Supertest starts every app under test with `listen(0)`, which binds the IPv6
 * wildcard address, but then hardcodes `127.0.0.1` in the request URL. When
 * another process already owns the assigned port number on IPv4 loopback (IDE
 * language servers and local proxies hold hundreds of 127.0.0.1 ports in the
 * ephemeral range), that request silently reaches the foreign process instead
 * of the test server, failing random tests with bogus responses. Rewriting the
 * URL to the loopback address of the family the server actually bound makes
 * those IPv4-only squatters unreachable from tests.
 */
const originalServerAddress = Test.prototype.serverAddress;
Test.prototype.serverAddress = function(app: Server, path: string) {
    const url = originalServerAddress.call(this, app, path);
    const address = app.address();
    if (address !== null && typeof address === 'object' && address.family === 'IPv6') {
        return url.replace('://127.0.0.1:', '://[::1]:');
    }
    return url;
};

const TEST_DB_PATH = './db/data/test.db';

/**
 * Clean up any existing test database files from previous runs
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
