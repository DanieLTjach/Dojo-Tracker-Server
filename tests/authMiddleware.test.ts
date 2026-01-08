import type { Request, Response, NextFunction } from 'express';
import { requireAuth, requireAdmin, optionalAuth } from '../src/middleware/AuthMiddleware.ts';
import { TokenService } from '../src/service/TokenService.ts';
import { MissingAuthTokenError, InvalidAuthTokenError, InsufficientPermissionsError } from '../src/error/AuthErrors.ts';
import { UserIsNotActive } from '../src/error/UserErrors.ts';
import type { User } from '../src/model/UserModels.ts';
import { jest } from '@jest/globals';

describe('AuthMiddleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let tokenService: TokenService;

    beforeEach(() => {
        tokenService = new TokenService();
        mockReq = {
            headers: {},
        };
        mockRes = {};
        mockNext = jest.fn();
    });

    describe('requireAuth', () => {
        it('should successfully authenticate with valid token', () => {
            const user: User = {
                id: 1,
                name: 'Test User',
                telegramId: 123456789,
                telegramUsername: '@testuser',
                isAdmin: 0,
                isActive: 1,
                createdAt: new Date().toISOString(),
                modifiedAt: new Date().toISOString(),
                modifiedBy: 'SYSTEM',
            };

            const { accessToken } = tokenService.createTokenPair(user);
            mockReq.headers = {
                authorization: `Bearer ${accessToken}`,
            };

            requireAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith();
            expect(mockReq.user).toBeDefined();
            expect(mockReq.user!.userId).toBe(user.id);
            expect(mockReq.user!.telegramId).toBe(user.telegramId);
        });

        it('should throw error when authorization header is missing', () => {
            mockReq.headers = {};

            requireAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(MissingAuthTokenError));
        });

        it('should throw error for invalid authorization header format (missing Bearer)', () => {
            const user: User = {
                id: 2,
                name: 'Test User',
                telegramId: 987654321,
                telegramUsername: '@test',
                isAdmin: 0,
                isActive: 1,
                createdAt: new Date().toISOString(),
                modifiedAt: new Date().toISOString(),
                modifiedBy: 'SYSTEM',
            };

            const { accessToken } = tokenService.createTokenPair(user);
            mockReq.headers = {
                authorization: accessToken, // Missing "Bearer " prefix
            };

            requireAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(InvalidAuthTokenError));
        });

        it('should throw error for invalid authorization header format (wrong scheme)', () => {
            mockReq.headers = {
                authorization: 'Basic some-token',
            };

            requireAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(InvalidAuthTokenError));
        });

        it('should throw error for inactive user', () => {
            const inactiveUser: User = {
                id: 3,
                name: 'Inactive User',
                telegramId: 111111111,
                telegramUsername: '@inactive',
                isAdmin: 0,
                isActive: 0, // Inactive
                createdAt: new Date().toISOString(),
                modifiedAt: new Date().toISOString(),
                modifiedBy: 'SYSTEM',
            };

            const { accessToken } = tokenService.createTokenPair(inactiveUser);
            mockReq.headers = {
                authorization: `Bearer ${accessToken}`,
            };

            requireAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(UserIsNotActive));
        });

        it('should throw error for invalid token', () => {
            mockReq.headers = {
                authorization: 'Bearer invalid-token-here',
            };

            requireAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = (mockNext as jest.Mock).mock.calls[0][0];
            expect(error).toBeDefined();
        });

        it('should throw error for expired token', () => {
            mockReq.headers = {
                authorization:
                    'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInRlbGVncmFtSWQiOjEyMzQ1Njc4OSwiaXNBZG1pbiI6ZmFsc2UsImlzQWN0aXZlIjp0cnVlLCJpYXQiOjE2MDk0NTkyMDAsImV4cCI6MTYwOTQ1OTIwMH0.signature',
            };

            requireAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = (mockNext as jest.Mock).mock.calls[0][0];
            expect(error).toBeDefined();
        });
    });

    describe('requireAdmin', () => {
        it('should allow admin user to proceed', () => {
            mockReq.user = {
                userId: 1,
                telegramId: 123456789,
                isAdmin: true,
                isActive: true,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 3600,
            };

            requireAdmin(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith();
        });

        it('should throw error when user is not in request', () => {
            mockReq.user = undefined;

            requireAdmin(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(MissingAuthTokenError));
        });

        it('should throw error when user is not admin', () => {
            mockReq.user = {
                userId: 2,
                telegramId: 987654321,
                isAdmin: false,
                isActive: true,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 3600,
            };

            requireAdmin(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(InsufficientPermissionsError));
        });
    });

    describe('optionalAuth', () => {
        it('should attach user when valid token is provided', () => {
            const user: User = {
                id: 4,
                name: 'Test User',
                telegramId: 222222222,
                telegramUsername: '@test',
                isAdmin: 1,
                isActive: 1,
                createdAt: new Date().toISOString(),
                modifiedAt: new Date().toISOString(),
                modifiedBy: 'SYSTEM',
            };

            const { accessToken } = tokenService.createTokenPair(user);
            mockReq.headers = {
                authorization: `Bearer ${accessToken}`,
            };

            optionalAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith();
            expect(mockReq.user).toBeDefined();
            expect(mockReq.user!.userId).toBe(user.id);
        });

        it('should continue without user when no authorization header', () => {
            mockReq.headers = {};

            optionalAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith();
            expect(mockReq.user).toBeUndefined();
        });

        it('should continue without user when authorization header format is invalid', () => {
            mockReq.headers = {
                authorization: 'InvalidFormat',
            };

            optionalAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith();
            expect(mockReq.user).toBeUndefined();
        });

        it('should continue without user when token is invalid', () => {
            mockReq.headers = {
                authorization: 'Bearer invalid-token',
            };

            optionalAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith();
            expect(mockReq.user).toBeUndefined();
        });

        it('should not attach inactive user', () => {
            const inactiveUser: User = {
                id: 5,
                name: 'Inactive User',
                telegramId: 333333333,
                telegramUsername: '@inactive',
                isAdmin: 0,
                isActive: 0, // Inactive
                createdAt: new Date().toISOString(),
                modifiedAt: new Date().toISOString(),
                modifiedBy: 'SYSTEM',
            };

            const { accessToken } = tokenService.createTokenPair(inactiveUser);
            mockReq.headers = {
                authorization: `Bearer ${accessToken}`,
            };

            optionalAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith();
            expect(mockReq.user).toBeUndefined();
        });

        it('should continue without user when authorization has wrong scheme', () => {
            mockReq.headers = {
                authorization: 'Basic some-credentials',
            };

            optionalAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith();
            expect(mockReq.user).toBeUndefined();
        });
    });
});
