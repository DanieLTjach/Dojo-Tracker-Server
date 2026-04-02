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
 * Creates a custom event for testing purposes.
 * @param id - Event ID
 * @param name - Event name
 * @param dateFrom - Event start date (optional)
 * @param dateTo - Event end date (optional)
 * @param gameRulesId - Game rules ID (defaults to 2)
 * @param clubId - Club ID (null means global event)
 */
export function createCustomEvent(
    id: number,
    name: string,
    dateFrom?: string,
    dateTo?: string,
    gameRulesId: number = 2,
    clubId: number | null = 1
): void {
    const timestamp = '2024-01-01T00:00:00.000Z';
    
    dbManager.db.prepare(
        `INSERT INTO event (id, name, type, gameRules, clubId, dateFrom, dateTo, startingRating, minimumGamesForRating, modifiedBy, createdAt, modifiedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name, 'SEASON', gameRulesId, clubId, dateFrom || null, dateTo || null, 0, 0, 0, timestamp, timestamp);
}

/**
 * Creates the test event with ID 1000 for testing purposes.
 * This event is used across multiple test files.
 * Date range: Jan 1, 2024 - Dec 31, 2026 (covers current test date of Jan 22, 2026)
 */
export function createTestEvent(): void {
    createCustomEvent(
        1000,
        'Тестовий сезон',
        '2024-01-01T00:00:00.000Z',
        '2026-12-31T23:59:59.999Z'
    );
}

/**
 * Deletes an event by id (useful for cleaning up test-created events).
 */
export function deleteEventById(eventId: number): void {
    dbManager.db.prepare('UPDATE club SET currentRatingEventId = NULL WHERE currentRatingEventId = ?').run(eventId);
    dbManager.db.prepare('DELETE FROM event WHERE id = ?').run(eventId);
}
