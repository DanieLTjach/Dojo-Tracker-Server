import jwt from 'jsonwebtoken';
import type { DecodedToken } from '../src/model/AuthModels.ts';
import config from '../config/config.ts';

/**
 * Generates a JWT token for testing purposes.
 * @param userId - User ID
 * @param telegramId - Telegram ID
 * @param isAdmin - Whether user is admin (default: false)
 * @param isActive - Whether user is active (default: true)
 * @returns JWT token string
 */
export function generateTestToken(
    userId: number,
    telegramId: number,
    isAdmin: boolean = false,
    isActive: boolean = true
): string {
    const payload: Omit<DecodedToken, 'iat' | 'exp'> = {
        userId,
        telegramId,
        isAdmin,
        isActive,
    };

    return jwt.sign(payload, config.jwtSecret, {
        expiresIn: config.jwtExpiry,
    });
}

/**
 * Creates an Authorization header value with Bearer token.
 * @param userId - User ID
 * @param telegramId - Telegram ID
 * @param isAdmin - Whether user is admin (default: false)
 * @param isActive - Whether user is active (default: true)
 * @returns Authorization header value
 */
export function createAuthHeader(
    userId: number,
    telegramId: number,
    isAdmin: boolean = false,
    isActive: boolean = true
): string {
    const token = generateTestToken(userId, telegramId, isAdmin, isActive);
    return `Bearer ${token}`;
}
