import request from 'supertest';
import express from 'express';
import userRoutes from '../src/routes/UserRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { closeDB } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader } from './testHelpers.ts';

const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);
app.use(handleErrors);

describe('User API Endpoints', () => {
    const SYSTEM_USER_ID = 0; // System admin user
    const ADMIN_TELEGRAM_ID = 123456789;
    const USER_TELEGRAM_ID = 987654321;

    // Create auth headers for admin and regular user
    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);

    let testUserId: number;
    let testUser2Id: number;
    let regularUserAuthHeader: string;

    afterAll(() => {
        // Close database connection
        closeDB();
        // Clean up test database files
        cleanupTestDatabase();
    });

    describe('POST /api/users', () => {
        it('should register a new user with telegram (admin only)', async () => {
            const userData = {
                name: 'Test User',
                telegramUsername: '@testuser',
                telegramId: 456456456
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', adminAuthHeader)
                .send(userData)
                .expect(201);

            testUserId = response.body.id;
            regularUserAuthHeader = createAuthHeader(testUserId);

            expect(response.body).toHaveProperty('id');
            expect(response.body.name).toBe(userData.name);
            expect(response.body.telegramUsername).toBe(userData.telegramUsername);
            expect(response.body.telegramId).toBe(userData.telegramId);
            expect(response.body.isActive).toBe(true);
            expect(response.body.isAdmin).toBe(false);
        });

        it('should register a new user (admin authenticated via JWT)', async () => {
            const userData = {
                name: 'Test User 2',
                telegramUsername: '@testuser2',
                telegramId: 789789789
            };

            const response = await request(app)
                .post('/api/users')
                .set('Authorization', adminAuthHeader)
                .send(userData)
                .expect(201);

            testUser2Id = response.body.id;
            expect(response.body).toHaveProperty('id');
            expect(response.body.name).toBe(userData.name);
        });

        it('should fail when no authentication token is provided', async () => {
            const userData = {
                name: 'Test User 3',
                telegramUsername: '@testuser3',
                telegramId: 111222333
            };

            await request(app)
                .post('/api/users')
                .send(userData)
                .expect(401);
        });

        it('should fail when user is not admin', async () => {
            const userData = {
                name: 'Test User 4',
                telegramUsername: '@testuser4',
                telegramId: 444555666
            };

            await request(app)
                .post('/api/users')
                .set('Authorization', regularUserAuthHeader)
                .send(userData)
                .expect(403);
        });

        it('should fail when name is missing', async () => {
            const userData = {
                telegramUsername: '@testuser3',
                telegramId: 111222333
            };

            await request(app)
                .post('/api/users')
                .set('Authorization', adminAuthHeader)
                .send(userData)
                .expect(400);
        });

        it('should fail when telegram username does not start with @', async () => {
            const userData = {
                name: 'Test User 3',
                telegramUsername: 'testuser3',
                telegramId: 111222333
            };

            await request(app)
                .post('/api/users')
                .set('Authorization', adminAuthHeader)
                .send(userData)
                .expect(400);
        });

        it('should fail when telegram ID is not a number', async () => {
            const userData = {
                name: 'Test User 4',
                telegramUsername: '@testuser4',
                telegramId: 'not-a-number'
            };

            await request(app)
                .post('/api/users')
                .set('Authorization', adminAuthHeader)
                .send(userData)
                .expect(400);
        });

        it('should fail when registering duplicate telegram username', async () => {
            const userData = {
                name: 'Unique Name',
                telegramUsername: '@testuser',
                telegramId: 999888777
            };

            await request(app)
                .post('/api/users')
                .set('Authorization', adminAuthHeader)
                .send(userData)
                .expect(400);
        });
    });

    describe('POST /api/users/without-telegram', () => {
        it('should register a new user without telegram (admin only)', async () => {
            const userData = {
                name: 'User Without Telegram'
            };

            const response = await request(app)
                .post('/api/users/without-telegram')
                .set('Authorization', adminAuthHeader)
                .send(userData)
                .expect(201);

            expect(response.body).toHaveProperty('id');
            expect(response.body.name).toBe(userData.name);
            expect(response.body.telegramUsername).toBeNull();
            expect(response.body.telegramId).toBeNull();
            expect(response.body.isActive).toBe(true);
        });

        it('should fail when name is missing', async () => {
            const userData = {};

            await request(app)
                .post('/api/users/without-telegram')
                .set('Authorization', adminAuthHeader)
                .send(userData)
                .expect(400);
        });

        it('should fail when no authentication token provided', async () => {
            const userData = {
                name: 'Another User'
            };

            await request(app)
                .post('/api/users/without-telegram')
                .send(userData)
                .expect(401);
        });

        it('should fail when user is not admin', async () => {
            const userData = {
                name: 'Another User'
            };

            await request(app)
                .post('/api/users/without-telegram')
                .set('Authorization', regularUserAuthHeader)
                .send(userData)
                .expect(403);
        });
    });

    describe('GET /api/users', () => {
        it('should return all users (requires auth)', async () => {
            const response = await request(app)
                .get('/api/users')
                .set('Authorization', adminAuthHeader)
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
        });

        it('should fail when no authentication token provided', async () => {
            await request(app)
                .get('/api/users')
                .expect(401);
        });
    });

    describe('GET /api/users/:id', () => {
        it('should return a user by id (requires auth)', async () => {
            const response = await request(app)
                .get(`/api/users/${testUserId}`)
                .set('Authorization', adminAuthHeader)
                .expect(200);

            expect(response.body).toHaveProperty('id', testUserId);
            expect(response.body).toHaveProperty('name');
        });

        it('should fail when user id does not exist', async () => {
            await request(app)
                .get('/api/users/99999')
                .set('Authorization', adminAuthHeader)
                .expect(404);
        });

        it('should fail when user id is not a number', async () => {
            await request(app)
                .get('/api/users/invalid')
                .set('Authorization', adminAuthHeader)
                .expect(400);
        });

        it('should fail when no authentication token provided', async () => {
            await request(app)
                .get(`/api/users/${testUserId}`)
                .expect(401);
        });
    });

    describe('GET /api/users/by-telegram-id/:telegramId', () => {
        it('should return a user by telegram id (requires auth)', async () => {
            const response = await request(app)
                .get('/api/users/by-telegram-id/456456456')
                .set('Authorization', adminAuthHeader)
                .expect(200);

            expect(response.body).toHaveProperty('telegramId', 456456456);
            expect(response.body.name).toBe('Test User');
        });

        it('should fail when telegram id does not exist', async () => {
            await request(app)
                .get('/api/users/by-telegram-id/888888888')
                .set('Authorization', adminAuthHeader)
                .expect(404);
        });

        it('should fail when telegram id is not a number', async () => {
            await request(app)
                .get('/api/users/by-telegram-id/invalid')
                .set('Authorization', adminAuthHeader)
                .expect(400);
        });

        it('should fail when no authentication token provided', async () => {
            await request(app)
                .get('/api/users/by-telegram-id/456456456')
                .expect(401);
        });
    });

    describe('PATCH /api/users/:id', () => {
        it('should update user name (requires auth)', async () => {
            const updateData = {
                name: 'Updated User Name'
            };

            const response = await request(app)
                .patch(`/api/users/${testUserId}`)
                .set('Authorization', regularUserAuthHeader)
                .send(updateData)
                .expect(200);

            expect(response.body.name).toBe(updateData.name);
            expect(response.body.id).toBe(testUserId);
        });

        it('should update user telegram username', async () => {
            const updateData = {
                telegramUsername: '@updatedusername'
            };

            const response = await request(app)
                .patch(`/api/users/${testUserId}`)
                .set('Authorization', regularUserAuthHeader)
                .send(updateData)
                .expect(200);

            expect(response.body.telegramUsername).toBe(updateData.telegramUsername);
        });

        it('should update both name and telegram username', async () => {
            const updateData = {
                name: 'Another Update',
                telegramUsername: '@anotherupdate'
            };

            const response = await request(app)
                .patch(`/api/users/${testUserId}`)
                .set('Authorization', regularUserAuthHeader)
                .send(updateData)
                .expect(200);

            expect(response.body.name).toBe(updateData.name);
            expect(response.body.telegramUsername).toBe(updateData.telegramUsername);
        });

        it('should fail when neither name nor telegram username is provided', async () => {
            const updateData = {};

            await request(app)
                .patch(`/api/users/${testUserId}`)
                .set('Authorization', regularUserAuthHeader)
                .send(updateData)
                .expect(400);
        });

        it('should fail when no authentication token provided', async () => {
            const updateData = {
                name: 'Test Name'
            };

            await request(app)
                .patch(`/api/users/${testUserId}`)
                .send(updateData)
                .expect(401);
        });

        it('should fail when user id does not exist', async () => {
            const updateData = {
                name: 'Test Name'
            };

            await request(app)
                .patch('/api/users/99999')
                .set('Authorization', adminAuthHeader)
                .send(updateData)
                .expect(404);
        });
    });

    describe('POST /api/users/:id/activate', () => {
        it('should activate a user (admin only)', async () => {
            const response = await request(app)
                .post(`/api/users/${testUserId}/activate`)
                .set('Authorization', adminAuthHeader)
                .send({})
                .expect(200);

            expect(response.body.isActive).toBe(true);
            expect(response.body.id).toBe(testUserId);
        });

        it('should fail when no authentication token provided', async () => {
            await request(app)
                .post(`/api/users/${testUserId}/activate`)
                .send({})
                .expect(401);
        });

        it('should fail when user is not admin', async () => {
            await request(app)
                .post(`/api/users/${testUserId}/activate`)
                .set('Authorization', regularUserAuthHeader)
                .send({})
                .expect(403);
        });

        it('should fail when user id does not exist', async () => {
            await request(app)
                .post('/api/users/99999/activate')
                .set('Authorization', adminAuthHeader)
                .send({})
                .expect(404);
        });
    });

    describe('POST /api/users/:id/deactivate', () => {
        it('should deactivate a user (admin only)', async () => {
            const response = await request(app)
                .post(`/api/users/${testUserId}/deactivate`)
                .set('Authorization', adminAuthHeader)
                .send({})
                .expect(200);

            expect(response.body.isActive).toBe(false);
            expect(response.body.id).toBe(testUserId);
        });

        it('should fail when no authentication token provided', async () => {
            await request(app)
                .post(`/api/users/${testUserId}/deactivate`)
                .send({})
                .expect(401);
        });

        it('should fail when user is not admin', async () => {
            await request(app)
                .post(`/api/users/${testUserId}/deactivate`)
                .set('Authorization', regularUserAuthHeader)
                .send({})
                .expect(403);
        });

        it('should fail when user id does not exist', async () => {
            await request(app)
                .post('/api/users/99999/deactivate')
                .set('Authorization', adminAuthHeader)
                .send({})
                .expect(404);
        });
    });
});
