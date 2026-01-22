import request from 'supertest';
import express from 'express';
import userRoutes from '../src/routes/UserRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader } from './testHelpers.ts';

const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);
app.use(handleErrors);

describe('User API Endpoints', () => {
    const SYSTEM_USER_ID = 0; // System admin user

    // Create auth headers for admin and regular user
    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);

    let testUserId: number;
    let testUser2Id: number;
    let regularUserAuthHeader: string;

    afterAll(() => {
        // Close database connection
        dbManager.closeDB();
        // Clean up test database files
        cleanupTestDatabase();
    });

    describe('POST /api/users', () => {
        it('should register a new user with telegram', async () => {
            const userData = {
                name: 'Test User',
                telegramUsername: '@testuser',
                telegramId: 456456456
            };

            const response = await request(app)
                .post('/api/users')
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

        it('should fail when name is missing', async () => {
            const userData = {
                telegramUsername: '@testuser3',
                telegramId: 111222333
            };

            const response = await request(app)
                .post('/api/users')
                .send(userData);

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid request data');
        });

        it('should fail when telegram username does not start with @', async () => {
            const userData = {
                name: 'Test User 3',
                telegramUsername: 'testuser3',
                telegramId: 111222333
            };

            const response = await request(app)
                .post('/api/users')
                .send(userData);

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid request data');
        });

        it('should fail when telegram ID is not a number', async () => {
            const userData = {
                name: 'Test User 4',
                telegramUsername: '@testuser4',
                telegramId: 'not-a-number'
            };

            const response = await request(app)
                .post('/api/users')
                .send(userData);

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid request data');
        });

        it('should fail when registering duplicate telegram username', async () => {
            const userData = {
                name: 'Unique Name',
                telegramUsername: '@testuser',
                telegramId: 999888777
            };

            const response = await request(app)
                .post('/api/users')
                .send(userData);

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Telegram юзернейм '@testuser' вже зайнятий іншим користувачем");
        });

        it('should fail when name already taken', async () => {
            const userData = {
                name: 'Test User',
                telegramUsername: '@newuser',
                telegramId: 555666777
            };

            const response = await request(app)
                .post('/api/users')
                .send(userData);

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Ім'я 'Test User' вже зайняте іншим користувачем");
        });

        it('should fail when telegram ID already exists', async () => {
            const userData = {
                name: 'Different Name',
                telegramUsername: '@differentuser',
                telegramId: 456456456
            };

            const response = await request(app)
                .post('/api/users')
                .send(userData);

            expect(response.status).toBe(400);
            expect(response.body.message).toBe('Користувач з Telegram id 456456456 вже існує');
        });
    });

    describe('POST /api/users/without-telegram', () => {
        it('should register a new user without telegram', async () => {
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

            const response = await request(app)
                .post('/api/users/without-telegram')
                .set('Authorization', adminAuthHeader)
                .send(userData);

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid request data');
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
            const response = await request(app)
                .get('/api/users');

            expect(response.status).toBe(401);
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
            const response = await request(app)
                .get('/api/users/99999')
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Користувача з id 99999 не знайдено');
        });

        it('should fail when user id is not a number', async () => {
            const response = await request(app)
                .get('/api/users/invalid')
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid request data');
        });

        it('should fail when no authentication token provided', async () => {
            const response = await request(app)
                .get(`/api/users/${testUserId}`);

            expect(response.status).toBe(401);
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
            const response = await request(app)
                .get('/api/users/by-telegram-id/888888888')
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Користувача з Telegram id 888888888 не знайдено');
        });

        it('should fail when telegram id is not a number', async () => {
            const response = await request(app)
                .get('/api/users/by-telegram-id/invalid')
                .set('Authorization', adminAuthHeader);

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid request data');
        });

        it('should fail when no authentication token provided', async () => {
            const response = await request(app)
                .get('/api/users/by-telegram-id/456456456');

            expect(response.status).toBe(401);
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

            const response = await request(app)
                .patch(`/api/users/${testUserId}`)
                .set('Authorization', regularUserAuthHeader)
                .send(updateData);

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid request data');
        });

        it('should fail when no authentication token provided', async () => {
            const updateData = {
                name: 'Test Name'
            };

            const response = await request(app)
                .patch(`/api/users/${testUserId}`)
                .send(updateData);

            expect(response.status).toBe(401);
        });

        it('should fail when user id does not exist', async () => {
            const updateData = {
                name: 'Test Name'
            };

            const response = await request(app)
                .patch('/api/users/99999')
                .set('Authorization', adminAuthHeader)
                .send(updateData);

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Користувача з id 99999 не знайдено');
        });

        it('should fail when name is already taken by another user', async () => {
            const updateData = {
                name: 'Test User 2'
            };

            const response = await request(app)
                .patch(`/api/users/${testUserId}`)
                .set('Authorization', regularUserAuthHeader)
                .send(updateData);

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Ім'я 'Test User 2' вже зайняте іншим користувачем");
        });

        it('should fail when telegram username is already taken by another user', async () => {
            const updateData = {
                telegramUsername: '@testuser2'
            };

            const response = await request(app)
                .patch(`/api/users/${testUserId}`)
                .set('Authorization', regularUserAuthHeader)
                .send(updateData);

            expect(response.status).toBe(400);
            expect(response.body.message).toBe("Telegram юзернейм '@testuser2' вже зайнятий іншим користувачем");
        });
    });

    describe('POST /api/users/:id/activate', () => {
        it('should activate a user (admin only)', async () => {
            const response = await request(app)
                .post(`/api/users/${testUser2Id}/activate`)
                .set('Authorization', adminAuthHeader)
                .send({})
                .expect(200);

            expect(response.body.isActive).toBe(true);
            expect(response.body.id).toBe(testUser2Id);
        });

        it('should fail when no authentication token provided', async () => {
            const response = await request(app)
                .post(`/api/users/${testUserId}/activate`)
                .send({});

            expect(response.status).toBe(401);
        });

        it('should fail when user is not admin', async () => {
            const response = await request(app)
                .post(`/api/users/${testUserId}/activate`)
                .set('Authorization', regularUserAuthHeader)
                .send({});

            expect(response.status).toBe(403);
            expect(response.body.message).toBe('Недостатньо прав для виконання цієї дії');
        });

        it('should fail when user id does not exist', async () => {
            const response = await request(app)
                .post('/api/users/99999/activate')
                .set('Authorization', adminAuthHeader)
                .send({});

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Користувача з id 99999 не знайдено');
        });
    });

    describe('POST /api/users/:id/deactivate', () => {
        it('should deactivate a user (admin only)', async () => {
            const response = await request(app)
                .post(`/api/users/${testUser2Id}/deactivate`)
                .set('Authorization', adminAuthHeader)
                .send({})
                .expect(200);

            expect(response.body.isActive).toBe(false);
            expect(response.body.id).toBe(testUser2Id);
        });

        it('should fail when no authentication token provided', async () => {
            const response = await request(app)
                .post(`/api/users/${testUserId}/deactivate`)
                .send({});

            expect(response.status).toBe(401);
        });

        it('should fail when user is not admin', async () => {
            const response = await request(app)
                .post(`/api/users/${testUserId}/deactivate`)
                .set('Authorization', regularUserAuthHeader)
                .send({});

            expect(response.status).toBe(403);
            expect(response.body.message).toBe('Недостатньо прав для виконання цієї дії');
        });

        it('should fail when user id does not exist', async () => {
            const response = await request(app)
                .post('/api/users/99999/deactivate')
                .set('Authorization', adminAuthHeader)
                .send({});

            expect(response.status).toBe(404);
            expect(response.body.message).toBe('Користувача з id 99999 не знайдено');
        });
    });
});
