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
        const payload: DecodedToken = { userId: user.id };
        const accessToken = jwt.sign(payload, config.jwtSecret, {
            expiresIn: config.jwtExpiry
        });
        return { accessToken };
    }

    /**
     * Verifies and decodes a JWT token.
     * @param token - The token to verify
     * @returns Decoded token payload
     * @throws Error if token is invalid or expired
     */
    verifyToken(token: string): DecodedToken {
        try {
            return jwt.verify(token, config.jwtSecret) as DecodedToken;
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
}
