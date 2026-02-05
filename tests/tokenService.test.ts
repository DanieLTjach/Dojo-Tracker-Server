import { TokenService } from '../src/service/TokenService.ts';
import type { User } from '../src/model/UserModels.ts';
import type { DecodedToken } from '../src/model/AuthModels.ts';
import jwt from 'jsonwebtoken';
import config from '../config/config.ts';
import { InvalidTokenError, TokenExpiredError } from '../src/error/AuthErrors.ts';

/**
 * Helper function to decode a token without verification (for testing).
 */
function decodeToken(token: string): DecodedToken | null {
    try {
        return jwt.decode(token) as DecodedToken;
    } catch {
        return null;
    }
}

describe('TokenService', () => {
    let tokenService: TokenService;

    beforeEach(() => {
        tokenService = new TokenService();
    });

    describe('createTokenPair', () => {
        it('should create a valid JWT token for a user', () => {
            const user: User = {
                id: 1,
                name: 'Test User',
                telegramId: 123456789,
                telegramUsername: '@testuser',
                isAdmin: false,
                isActive: true,
                status: 'ACTIVE',
                createdAt: new Date(),
                modifiedAt: new Date(),
                modifiedBy: 'SYSTEM'
            };

            const tokenPair = tokenService.createTokenPair(user);

            expect(tokenPair).toHaveProperty('accessToken');
            expect(typeof tokenPair.accessToken).toBe('string');
            expect(tokenPair.accessToken.length).toBeGreaterThan(0);
        });

        it('should create token with correct payload structure', () => {
            const user: User = {
                id: 2,
                name: 'Admin User',
                telegramId: 987654321,
                telegramUsername: '@admin',
                isAdmin: true,
                isActive: true,
                status: 'ACTIVE',
                createdAt: new Date(),
                modifiedAt: new Date(),
                modifiedBy: 'SYSTEM'
            };

            const tokenPair = tokenService.createTokenPair(user);
            const decoded = tokenService.verifyToken(tokenPair.accessToken);

            expect(decoded.userId).toBe(user.id);
            expect(decoded).toHaveProperty('iat');
            expect(decoded).toHaveProperty('exp');
        });
    });

    describe('verifyToken', () => {
        it('should successfully verify a valid token', () => {
            const user: User = {
                id: 5,
                name: 'Test User',
                telegramId: 333333333,
                telegramUsername: '@test',
                isAdmin: true,
                isActive: true,
                status: 'ACTIVE',
                createdAt: new Date(),
                modifiedAt: new Date(),
                modifiedBy: 'SYSTEM'
            };

            const tokenPair = tokenService.createTokenPair(user);
            const decoded = tokenService.verifyToken(tokenPair.accessToken);

            expect(decoded).toBeDefined();
            expect(decoded.userId).toBe(user.id);
        });

        it('should throw error for expired token', () => {
            const user: User = {
                id: 6,
                name: 'Test User',
                telegramId: 444444444,
                telegramUsername: '@test',
                isAdmin: false,
                isActive: true,
                status: 'ACTIVE',
                createdAt: new Date(),
                modifiedAt: new Date(),
                modifiedBy: 'SYSTEM'
            };

            // Create an expired token (expired 1 hour ago)
            const expiredToken = jwt.sign(
                { userId: user.id, telegramId: user.telegramId, isAdmin: false, isActive: true },
                config.jwtSecret,
                { expiresIn: '-1h' }
            );

            expect(() => {
                tokenService.verifyToken(expiredToken);
            }).toThrow(new TokenExpiredError());
        });

        it('should throw error for invalid token signature', () => {
            const user: User = {
                id: 7,
                name: 'Test User',
                telegramId: 555555555,
                telegramUsername: '@test',
                isAdmin: false,
                isActive: true,
                status: 'ACTIVE',
                createdAt: new Date(),
                modifiedAt: new Date(),
                modifiedBy: 'SYSTEM'
            };

            // Create a token with wrong secret
            const invalidToken = jwt.sign(
                { userId: user.id, telegramId: user.telegramId, isAdmin: false, isActive: true },
                'wrong-secret',
                { expiresIn: '1h' }
            );

            expect(() => {
                tokenService.verifyToken(invalidToken);
            }).toThrow(new InvalidTokenError());
        });

        it('should throw error for malformed token', () => {
            expect(() => {
                tokenService.verifyToken('not-a-valid-jwt-token');
            }).toThrow(new InvalidTokenError());
        });

        it('should throw error for empty token', () => {
            expect(() => {
                tokenService.verifyToken('');
            }).toThrow(new InvalidTokenError());
        });
    });

    describe('decodeToken', () => {
        it('should decode a valid token without verification', () => {
            const user: User = {
                id: 8,
                name: 'Test User',
                telegramId: 666666666,
                telegramUsername: '@test',
                isAdmin: true,
                isActive: true,
                status: 'ACTIVE',
                createdAt: new Date(),
                modifiedAt: new Date(),
                modifiedBy: 'SYSTEM'
            };

            const tokenPair = tokenService.createTokenPair(user);
            const decoded = decodeToken(tokenPair.accessToken);

            expect(decoded).toBeDefined();
            expect(decoded!.userId).toBe(user.id);
        });

        it('should decode token with wrong signature without throwing error', () => {
            const invalidToken = jwt.sign(
                { userId: 9, telegramId: 777777777, isAdmin: false, isActive: true },
                'wrong-secret',
                { expiresIn: '1h' }
            );

            const decoded = decodeToken(invalidToken);

            expect(decoded).toBeDefined();
            expect(decoded!.userId).toBe(9);
        });

        it('should return null for malformed token', () => {
            const decoded = decodeToken('not-a-valid-token');

            expect(decoded).toBeNull();
        });

        it('should return null for empty string', () => {
            const decoded = decodeToken('');

            expect(decoded).toBeNull();
        });

        it('should decode expired token without throwing error', () => {
            const expiredToken = jwt.sign(
                { userId: 10, telegramId: 888888888, isAdmin: false, isActive: true },
                config.jwtSecret,
                { expiresIn: '-1h' }
            );

            const decoded = decodeToken(expiredToken);

            expect(decoded).toBeDefined();
            expect(decoded!.userId).toBe(10);
        });
    });

});
