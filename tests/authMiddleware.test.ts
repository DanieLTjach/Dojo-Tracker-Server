import type { Request, Response, NextFunction } from 'express';
import { requireAuth, requireAdmin } from '../src/middleware/AuthMiddleware.ts';
import { TokenService } from '../src/service/TokenService.ts';
import { UserService } from '../src/service/UserService.ts';
import { MissingAuthTokenError, InvalidAuthTokenError, InsufficientPermissionsError } from '../src/error/AuthErrors.ts';
import type { User } from '../src/model/UserModels.ts';
import { jest } from '@jest/globals';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';

describe('AuthMiddleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let tokenService: TokenService;
    let userService: UserService;
    let testUser: User;

    // SYSTEM_USER_ID (0) is already an admin in the database
    const SYSTEM_USER_ID = 0;

    beforeAll(() => {
        userService = new UserService();
        // Create test user
        testUser = userService.registerUser("test_name", 'testuser', 123456789, 0);
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    beforeEach(() => {
        tokenService = new TokenService();
        mockReq = {
            headers: {}
        };
        mockRes = {};
        mockNext = jest.fn();
    });

    describe('requireAuth', () => {
        it('should successfully authenticate with valid token', () => {
            const { accessToken } = tokenService.createTokenPair(testUser);
            mockReq.headers = {
                authorization: `Bearer ${accessToken}`
            };

            requireAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith();
            expect(mockReq.user).toBeDefined();
            expect(mockReq.user!.userId).toBe(testUser.id);
        });

        it('should throw error when authorization header is missing', () => {
            mockReq.headers = {};

            requireAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(MissingAuthTokenError));
        });

        it('should throw error for invalid authorization header format (missing Bearer)', () => {
            const { accessToken } = tokenService.createTokenPair(testUser);
            mockReq.headers = {
                authorization: accessToken // Missing "Bearer " prefix
            };

            requireAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(InvalidAuthTokenError));
        });

        it('should throw error for invalid authorization header format (wrong scheme)', () => {
            mockReq.headers = {
                authorization: 'Basic some-token'
            };

            requireAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(InvalidAuthTokenError));
        });

        it('should throw error for invalid token', () => {
            mockReq.headers = {
                authorization: 'Bearer invalid-token-here'
            };

            requireAuth(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalled();
            const error = (mockNext as jest.Mock).mock.calls[0]![0];
            expect(error).toBeDefined();
        });
    });

    describe('requireAdmin', () => {
        it('should allow admin user to proceed', () => {
            mockReq.user = {
                userId: SYSTEM_USER_ID,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 3600
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
                userId: testUser.id,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 3600
            };

            requireAdmin(mockReq as Request, mockRes as Response, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(InsufficientPermissionsError));
        });
    });
});
