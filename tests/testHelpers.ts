import jwt from 'jsonwebtoken';
import type { DecodedToken } from '../src/model/AuthModels.ts';
import config from '../config/config.ts';

/**
 * Generates a JWT token for testing purposes.
 * @param userId - User ID
 * @returns JWT token string
 */
export function generateTestToken(userId: number): string {
    const payload: DecodedToken = { userId };

    return jwt.sign(payload, config.jwtSecret, {
        expiresIn: config.jwtExpiry
    });
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
