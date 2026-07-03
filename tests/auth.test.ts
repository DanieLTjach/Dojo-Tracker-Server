import crypto from 'crypto';
import request from 'supertest';
import express from 'express';
import authRoutes from '../src/routes/AuthRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { HashUtil } from '../src/util/HashUtil.ts';
import { UserService } from '../src/service/UserService.ts';
import { UserRepository } from '../src/repository/UserRepository.ts';
import config from '../config/config.ts';
import { TokenService } from '../src/service/TokenService.ts';
import { RefreshTokenRepository } from '../src/repository/RefreshTokenRepository.ts';
import type { RefreshTokenRow, TokenPair } from '../src/model/AuthModels.ts';

const app = express();
app.use(express.json());
app.use('/api', authRoutes);
app.use(handleErrors);

describe('Authentication API Endpoints', () => {
    const BOT_TOKEN = config.botToken;
    const TEST_TELEGRAM_ID = 987654321;
    const TEST_USERNAME = 'testuser';
    const userService = new UserService();
    const userRepository = new UserRepository();
    const tokenService = new TokenService();
    const refreshTokenRepository = new RefreshTokenRepository();
    let testUserId: number;

    beforeAll(() => {
        // Create test user before running auth tests
        const user = userService.registerUser('name', TEST_USERNAME, TEST_TELEGRAM_ID, 0);
        testUserId = user.id;
        // Activate the user for tests
        userRepository.updateUserStatus(user.id, true, 'ACTIVE', 0);
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    /**
     * Helper function to generate valid Telegram initData
     * Follows the same algorithm as Telegram Mini Apps
     */
    function generateValidInitData(telegramId: number, username: string): Record<string, string> {
        const authDate = Math.floor(Date.now() / 1000);
        const user = JSON.stringify({
            id: telegramId,
            first_name: 'Test',
            last_name: 'User',
            username: username,
            language_code: 'en',
        });

        // Create data-check-string (sorted params except hash)
        const params = {
            auth_date: authDate.toString(),
            user: user,
        };

        const dataCheckString = Object.entries(params)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        // Calculate hash using bot token
        const secretKey = HashUtil.hmac(BOT_TOKEN, 'WebAppData');
        const hash = HashUtil.hmac(dataCheckString, secretKey).toString('hex');

        return {
            ...params,
            hash,
        };
    }

    /**
     * Helper function to generate initData with invalid hash
     */
    function generateInvalidInitData(): Record<string, string> {
        const authDate = Math.floor(Date.now() / 1000);
        const user = JSON.stringify({
            id: TEST_TELEGRAM_ID,
            first_name: 'Test',
            username: TEST_USERNAME,
        });

        return {
            auth_date: authDate.toString(),
            user: user,
            hash: 'invalid_hash_value',
        };
    }

    /**
     * Helper function to generate expired initData
     */
    function generateExpiredInitData(): Record<string, string> {
        // Set auth_date to 25 hours ago (beyond default 24 hour validity)
        const authDate = Math.floor(Date.now() / 1000) - (25 * 60 * 60);
        const user = JSON.stringify({
            id: TEST_TELEGRAM_ID,
            first_name: 'Test',
            username: TEST_USERNAME,
        });

        const params = {
            auth_date: authDate.toString(),
            user: user,
        };

        const dataCheckString = Object.entries(params)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');

        const secretKey = HashUtil.hmac(BOT_TOKEN, 'WebAppData');
        const hash = HashUtil.hmac(dataCheckString, secretKey).toString('hex');

        return {
            ...params,
            hash,
        };
    }

    async function authenticateUser(
        telegramId: number = TEST_TELEGRAM_ID,
        username: string = TEST_USERNAME
    ): Promise<TokenPair> {
        const initData = generateValidInitData(telegramId, username);

        const response = await request(app)
            .post('/api/authenticate')
            .query(initData)
            .expect(200);

        return response.body as TokenPair;
    }

    function findRefreshTokenRow(refreshToken: string): RefreshTokenRow {
        const tokenHash = tokenService.hashRefreshToken(refreshToken);
        const tokenRow = refreshTokenRepository.findByHash(tokenHash);

        expect(tokenRow).toBeDefined();

        return tokenRow!;
    }

    describe('POST /api/authenticate', () => {
        it('should authenticate an existing user and persist a hashed refresh token', async () => {
            const tokenPair = await authenticateUser();
            const refreshTokenRow = findRefreshTokenRow(tokenPair.refreshToken);

            expect(tokenPair).toHaveProperty('accessToken');
            expect(tokenPair).toHaveProperty('refreshToken');
            expect(typeof tokenPair.refreshToken).toBe('string');
            expect(tokenPair.refreshToken.length).toBeGreaterThan(0);
            expect(refreshTokenRow.userId).toBe(testUserId);
            expect(refreshTokenRow.tokenHash).not.toBe(tokenPair.refreshToken);
            expect(refreshTokenRow.tokenHash).toHaveLength(64);
            expect(refreshTokenRow.rotatedAt).toBeNull();
            expect(refreshTokenRow.revokedAt).toBeNull();
        });

        it('should reject authentication for non-existent user', async () => {
            const nonExistentTelegramId = 999888777;
            const initData = generateValidInitData(nonExistentTelegramId, 'nonexistent');

            const response = await request(app)
                .post('/api/authenticate')
                .query(initData)
                .expect(404);

            expect(response.body).toHaveProperty('errorCode', 'userNotFoundByTelegramId');
        });

        it('should reject authentication with invalid hash', async () => {
            const initData = generateInvalidInitData();

            const response = await request(app)
                .post('/api/authenticate')
                .query(initData)
                .expect(401);

            expect(response.body).toHaveProperty('errorCode', 'invalidInitData');
            expect(response.body.message).toBe('Невалідні дані автентифікації Telegram: Hash mismatch');
        });

        it('should reject authentication with expired auth_date', async () => {
            const initData = generateExpiredInitData();

            const response = await request(app)
                .post('/api/authenticate')
                .query(initData)
                .expect(401);

            expect(response.body).toHaveProperty('errorCode', 'expiredAuthData');
            expect(response.body.message).toBe(
                'Термін дії даних автентифікації минув. Будь ласка, закрийте та відкрийте додаток заново.'
            );
        });

        it('should reject authentication with missing hash', async () => {
            const authDate = Math.floor(Date.now() / 1000);
            const user = JSON.stringify({
                id: TEST_TELEGRAM_ID,
                username: TEST_USERNAME,
            });

            const response = await request(app)
                .post('/api/authenticate')
                .query({
                    auth_date: authDate.toString(),
                    user: user,
                    // hash is missing
                })
                .expect(401);

            expect(response.body).toHaveProperty('errorCode', 'invalidInitData');
        });

        it('should reject authentication with missing auth_date', async () => {
            const user = JSON.stringify({
                id: TEST_TELEGRAM_ID,
                username: TEST_USERNAME,
            });

            const response = await request(app)
                .post('/api/authenticate')
                .query({
                    user: user,
                    hash: 'some_hash',
                    // auth_date is missing
                })
                .expect(401);

            expect(response.body).toHaveProperty('errorCode', 'invalidInitData');
        });

        it('should reject authentication for inactive user', async () => {
            const inactiveTelegramId = 777888999;
            // Create an inactive user
            const user = userService.registerUser('inactive_name', 'inactiveuser', inactiveTelegramId, 0);
            userRepository.updateUserStatus(user.id, false, 'INACTIVE', 0);
            const initData = generateValidInitData(inactiveTelegramId, 'inactiveuser');

            const response = await request(app)
                .post('/api/authenticate')
                .query(initData)
                .expect(403);

            expect(response.body).toHaveProperty('errorCode', 'userIsNotActive');
        });
    });

    describe('POST /api/authenticate/refresh', () => {
        it('should rotate a live refresh token and return a new valid access token', async () => {
            const tokenPair = await authenticateUser();
            const oldRefreshTokenRow = findRefreshTokenRow(tokenPair.refreshToken);

            const response = await request(app)
                .post('/api/authenticate/refresh')
                .send({ refreshToken: tokenPair.refreshToken })
                .expect(200);

            const nextTokenPair = response.body as TokenPair;
            const rotatedOldTokenRow = findRefreshTokenRow(tokenPair.refreshToken);
            const nextRefreshTokenRow = findRefreshTokenRow(nextTokenPair.refreshToken);
            const decodedAccessToken = tokenService.verifyToken(nextTokenPair.accessToken);

            expect(decodedAccessToken.userId).toBe(testUserId);
            expect(nextTokenPair.refreshToken).not.toBe(tokenPair.refreshToken);
            expect(rotatedOldTokenRow.rotatedAt).toBeInstanceOf(Date);
            expect(rotatedOldTokenRow.revokedAt).toBeNull();
            expect(nextRefreshTokenRow.familyId).toBe(oldRefreshTokenRow.familyId);
            expect(nextRefreshTokenRow.rotatedAt).toBeNull();
            expect(nextRefreshTokenRow.revokedAt).toBeNull();
        });

        it('should reject an expired refresh token', async () => {
            const expiredRefreshToken = tokenService.generateRefreshToken();
            refreshTokenRepository.insert(
                testUserId,
                expiredRefreshToken.tokenHash,
                crypto.randomUUID(),
                new Date(Date.now() - 60_000)
            );

            const response = await request(app)
                .post('/api/authenticate/refresh')
                .send({ refreshToken: expiredRefreshToken.token })
                .expect(401);

            expect(response.body).toHaveProperty('errorCode', 'refreshTokenExpired');
        });

        it('should reject an unknown refresh token', async () => {
            const response = await request(app)
                .post('/api/authenticate/refresh')
                .send({ refreshToken: tokenService.generateRefreshToken().token })
                .expect(401);

            expect(response.body).toHaveProperty('errorCode', 'invalidRefreshToken');
        });

        it('should revoke a refresh-token family when a rotated token is reused', async () => {
            const tokenPair = await authenticateUser();

            const firstRefreshResponse = await request(app)
                .post('/api/authenticate/refresh')
                .send({ refreshToken: tokenPair.refreshToken })
                .expect(200);
            const nextTokenPair = firstRefreshResponse.body as TokenPair;

            const reuseResponse = await request(app)
                .post('/api/authenticate/refresh')
                .send({ refreshToken: tokenPair.refreshToken })
                .expect(401);
            const revokedNextTokenRow = findRefreshTokenRow(nextTokenPair.refreshToken);

            const revokedNextResponse = await request(app)
                .post('/api/authenticate/refresh')
                .send({ refreshToken: nextTokenPair.refreshToken })
                .expect(401);

            expect(reuseResponse.body).toHaveProperty('errorCode', 'invalidRefreshToken');
            expect(revokedNextTokenRow.revokedAt).toBeInstanceOf(Date);
            expect(revokedNextResponse.body).toHaveProperty('errorCode', 'invalidRefreshToken');
        });

        it('should reject refresh for a deactivated user without rotating the token', async () => {
            const inactiveLaterTelegramId = 123123123;
            const inactiveLaterUsername = 'inactive_later';
            const user = userService.registerUser(
                'inactive_later_name',
                inactiveLaterUsername,
                inactiveLaterTelegramId,
                0
            );
            userRepository.updateUserStatus(user.id, true, 'ACTIVE', 0);
            const tokenPair = await authenticateUser(inactiveLaterTelegramId, inactiveLaterUsername);
            userRepository.updateUserStatus(user.id, false, 'INACTIVE', 0);

            const response = await request(app)
                .post('/api/authenticate/refresh')
                .send({ refreshToken: tokenPair.refreshToken })
                .expect(401);
            const refreshTokenRow = findRefreshTokenRow(tokenPair.refreshToken);

            expect(response.body).toHaveProperty('errorCode', 'invalidAuthToken');
            expect(refreshTokenRow.rotatedAt).toBeNull();
            expect(refreshTokenRow.revokedAt).toBeNull();
        });

        it('should reject missing and garbage refresh token bodies', async () => {
            const missingResponse = await request(app)
                .post('/api/authenticate/refresh')
                .send({})
                .expect(401);
            const garbageResponse = await request(app)
                .post('/api/authenticate/refresh')
                .send({ refreshToken: 12345 })
                .expect(401);

            expect(missingResponse.body).toHaveProperty('errorCode', 'invalidRefreshToken');
            expect(garbageResponse.body).toHaveProperty('errorCode', 'invalidRefreshToken');
        });
    });
});
