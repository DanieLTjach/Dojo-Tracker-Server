import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import authRoutes from '../src/routes/AuthRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { closeDB } from '../src/db/dbInit.ts';
import { TEST_DB_PATH, cleanupTestDatabase } from './setup.ts';
import { HashUtil } from '../src/util/HashUtil.ts';
import config from '../config/config.ts';

const app = express();
app.use(express.json());
app.use('/api', authRoutes);
app.use(handleErrors);

describe('Authentication API Endpoints', () => {
    const BOT_TOKEN = config.botToken;
    const TEST_TELEGRAM_ID = 987654321;
    const TEST_USERNAME = 'testuser';

    afterAll(() => {
        closeDB();
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
        const secretKey = HashUtil.hmac('WebAppData', BOT_TOKEN);
        const hash = HashUtil.hmacHex(dataCheckString, secretKey);

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
        // Set auth_date to 2 hours ago (beyond default 1 hour validity)
        const authDate = Math.floor(Date.now() / 1000) - 2 * 60 * 60;
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

        const secretKey = HashUtil.hmac('WebAppData', BOT_TOKEN);
        const hash = HashUtil.hmacHex(dataCheckString, secretKey);

        return {
            ...params,
            hash,
        };
    }

    describe('POST /api/authenticate', () => {
        it('should authenticate a new user and auto-create account', async () => {
            const initData = generateValidInitData(TEST_TELEGRAM_ID, TEST_USERNAME);

            const response = await request(app).post('/api/authenticate').query(initData).expect(200);

            expect(response.body).toHaveProperty('accessToken');
            expect(response.body).toHaveProperty('user');
            expect(response.body.user.telegramId).toBe(TEST_TELEGRAM_ID);
            expect(response.body.user.name).toContain(TEST_USERNAME);
            expect(response.body.user.isActive).toBe(true);
            expect(response.body.user.isAdmin).toBe(false);
        });

        it('should authenticate an existing user', async () => {
            const initData = generateValidInitData(TEST_TELEGRAM_ID, TEST_USERNAME);

            const response = await request(app).post('/api/authenticate').query(initData).expect(200);

            expect(response.body).toHaveProperty('accessToken');
            expect(response.body).toHaveProperty('user');
            expect(response.body.user.telegramId).toBe(TEST_TELEGRAM_ID);
        });

        it('should reject authentication with invalid hash', async () => {
            const initData = generateInvalidInitData();

            const response = await request(app).post('/api/authenticate').query(initData).expect(401);

            expect(response.body).toHaveProperty('errorCode', 'invalidInitData');
            expect(response.body.message).toContain('Invalid Telegram authentication data');
        });

        it('should reject authentication with expired auth_date', async () => {
            const initData = generateExpiredInitData();

            const response = await request(app).post('/api/authenticate').query(initData).expect(401);

            expect(response.body).toHaveProperty('errorCode', 'expiredAuthData');
            expect(response.body.message).toContain('expired');
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

        it('should create user with fallback name when username is missing', async () => {
            const newTelegramId = 111222333;
            const authDate = Math.floor(Date.now() / 1000);
            const user = JSON.stringify({
                id: newTelegramId,
                first_name: 'John',
            });

            const params = {
                auth_date: authDate.toString(),
                user: user,
            };

            const dataCheckString = Object.entries(params)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, value]) => `${key}=${value}`)
                .join('\n');

            const secretKey = HashUtil.hmac('WebAppData', BOT_TOKEN);
            const hash = HashUtil.hmacHex(dataCheckString, secretKey);

            const response = await request(app)
                .post('/api/authenticate')
                .query({ ...params, hash })
                .expect(200);

            expect(response.body).toHaveProperty('accessToken');
            expect(response.body.user.name).toBe('John');
            expect(response.body.user.telegramId).toBe(newTelegramId);
        });

        it('should create user with telegram ID fallback when no names provided', async () => {
            const newTelegramId = 444555666;
            const authDate = Math.floor(Date.now() / 1000);
            const user = JSON.stringify({
                id: newTelegramId,
            });

            const params = {
                auth_date: authDate.toString(),
                user: user,
            };

            const dataCheckString = Object.entries(params)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, value]) => `${key}=${value}`)
                .join('\n');

            const secretKey = HashUtil.hmac('WebAppData', BOT_TOKEN);
            const hash = HashUtil.hmacHex(dataCheckString, secretKey);

            const response = await request(app)
                .post('/api/authenticate')
                .query({ ...params, hash })
                .expect(200);

            expect(response.body).toHaveProperty('accessToken');
            expect(response.body.user.name).toBe(`TelegramUser${newTelegramId}`);
            expect(response.body.user.telegramId).toBe(newTelegramId);
        });
    });
});
