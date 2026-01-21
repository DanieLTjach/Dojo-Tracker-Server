import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import type { DecodedToken } from '../src/model/AuthModels.ts';
import config from '../config/config.ts';
import { dbManager } from '../src/db/dbInit.ts';

/**
 * Generates a JWT token for testing purposes.
 * @param userId - User ID
 * @returns JWT token string
 */
export function generateTestToken(userId: number): string {
    const payload: DecodedToken = { userId };

    return jwt.sign(payload, config.jwtSecret, {
        expiresIn: config.jwtExpiry
    } as SignOptions);
}

/**
 * Creates an Authorization header value with Bearer token.
 * @param userId - User ID
 * @returns Authorization header value
 */
export function createAuthHeader(userId: number): string {
    const token = generateTestToken(userId);
    return `Bearer ${token}`;
}

/**
 * Creates the test event with ID 1 for testing purposes.
 * This event is used across multiple test files.
 */
export async function createTestEvent(): Promise<void> {
    const timestamp = '2024-01-01T00:00:00.000Z';
    
    dbManager.db.prepare(
        `INSERT INTO event (id, name, type, gameRules, modifiedBy, createdAt, modifiedAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(1, 'Test Event', 'SEASON', 1, 0, timestamp, timestamp);
}
