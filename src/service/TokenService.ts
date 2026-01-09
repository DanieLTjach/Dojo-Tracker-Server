import jwt from 'jsonwebtoken';
import type { TokenPair, DecodedToken } from '../model/AuthModels.ts';
import type { User } from '../model/UserModels.ts';
import config from '../../config/config.ts';

export class TokenService {

    /**
     * Creates a JWT token pair for a user.
     * @param user - The user to create tokens for
     * @returns TokenPair with accessToken
     */
    createTokenPair(user: User): TokenPair {
        const payload: Omit<DecodedToken, 'iat' | 'exp'> = {
            userId: user.id,
            telegramId: user.telegramId!,
            isAdmin: !!user.isAdmin, // Convert 0/1 to boolean
            isActive: !!user.isActive
        };

        const accessToken = jwt.sign(payload, config.jwtSecret, {
            expiresIn: config.jwtExpiry
        });

        return {
            accessToken
            // refreshToken can be added later if needed
        };
    }

    /**
     * Verifies and decodes a JWT token.
     * @param token - The token to verify
     * @returns Decoded token payload
     * @throws Error if token is invalid or expired
     */
    verifyToken(token: string): DecodedToken {
        try {
            const decoded = jwt.verify(token, config.jwtSecret) as DecodedToken;
            return decoded;
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                throw new Error('Token has expired');
            }
            if (error instanceof jwt.JsonWebTokenError) {
                throw new Error('Invalid token');
            }
            throw error;
        }
    }

    /**
     * Decodes a token without verification (for testing/debugging).
     * WARNING: Do not use for authentication!
     * @param token - The token to decode
     * @returns Decoded token payload or null if invalid
     */
    decodeToken(token: string): DecodedToken | null {
        try {
            return jwt.decode(token) as DecodedToken;
        } catch {
            return null;
        }
    }
}
