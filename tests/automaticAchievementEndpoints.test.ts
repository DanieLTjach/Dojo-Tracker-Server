import request from 'supertest';
import express from 'express';
import userRoutes from '../src/routes/UserRoutes.ts';
import clubRoutes from '../src/routes/ClubRoutes.ts';
import achievementRoutes from '../src/routes/AchievementRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader } from './testHelpers.ts';
import { UserService } from '../src/service/UserService.ts';
import { UserRepository } from '../src/repository/UserRepository.ts';
import { ClubMembershipService } from '../src/service/ClubMembershipService.ts';
import { ClubRepository } from '../src/repository/ClubRepository.ts';

const app = express();
app.use(express.json());
app.use('/api/users', userRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/achievements', achievementRoutes);
app.use(handleErrors);

describe('Automatic achievement endpoints', () => {
    const SYSTEM_USER_ID = 0;

    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);
    let ownerAuthHeader: string;
    let memberAuthHeader: string;

    let ownerId: number;
    let memberId: number;
    let clubId: number;

    const membershipService = new ClubMembershipService();
    const clubRepository = new ClubRepository();

    beforeAll(() => {
        const userService = new UserService();
        const userRepository = new UserRepository();

        const ownerUser = userService.registerUser('AchApiOwner', 'ach_api_owner', 77661101, SYSTEM_USER_ID);
        const memberUser = userService.registerUser('AchApiMember', 'ach_api_member', 77661102, SYSTEM_USER_ID);

        ownerId = ownerUser.id;
        memberId = memberUser.id;

        userRepository.updateUserStatus(ownerId, true, 'ACTIVE', SYSTEM_USER_ID);
        userRepository.updateUserStatus(memberId, true, 'ACTIVE', SYSTEM_USER_ID);

        ownerAuthHeader = createAuthHeader(ownerId);
        memberAuthHeader = createAuthHeader(memberId);

        clubId = clubRepository.createClub({
            name: 'Automatic Achievement API Club',
            address: null,
            city: null,
            country: 'UA',
            locale: 'en',
            description: null,
            contactInfo: null,
            isActive: true,
            createdAt: new Date(),
            modifiedBy: SYSTEM_USER_ID,
        });

        membershipService.createActiveMembership(clubId, ownerId, SYSTEM_USER_ID);
        membershipService.updateMemberRole(clubId, ownerId, 'OWNER', SYSTEM_USER_ID);
        membershipService.createActiveMembership(clubId, memberId, SYSTEM_USER_ID);
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM clubUserAchievement WHERE clubId = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM clubAchievementDefinition WHERE clubId = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?)').run(ownerId, memberId);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('GET /api/achievements/catalog', () => {
        test('returns localized automatic achievement catalog and categories list', async () => {
            const response = await request(app)
                .get('/api/achievements/catalog')
                .set('Authorization', ownerAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('catalog');
            expect(response.body).toHaveProperty('categories');
            expect(Array.isArray(response.body.categories)).toBe(true);
            expect(response.body.categories).toHaveLength(11);
            expect(Array.isArray(response.body.catalog)).toBe(true);
            expect(response.body.catalog.length).toBeGreaterThan(50);
            expect(response.body.catalog[0]).toHaveProperty('code');
            expect(response.body.catalog[0]).toHaveProperty('name');
            expect(response.body.catalog[0]).toHaveProperty('description');
        });
    });

    describe('GET /api/users/:id/achievements', () => {
        test('returns user achievements, progress, and coverage with assignmentId and correct timestamps', async () => {
            // Assign a manual achievement to ownerId
            const assignRes = await request(app)
                .post(`/api/clubs/${clubId}/members/${ownerId}/achievements`)
                .set('Authorization', ownerAuthHeader)
                .send({
                    builtInCode: 'MENTOR',
                    note: 'Founder note',
                });
            expect(assignRes.status).toBe(201);
            const assignmentId = assignRes.body.id;

            // Seed an automatic achievement state directly for testing
            dbManager.db.prepare(`
                INSERT INTO automaticAchievementState (
                    userId, code, scope, progress, target, unlockedAt, computedAt
                ) VALUES (
                    ?, 'GAMES_10', 'GLOBAL', 10, 10, '2026-08-20T10:00:00.000Z', '2026-08-20T10:00:00.000Z'
                )
            `).run(ownerId);

            dbManager.db.prepare(`
                INSERT INTO automaticAchievementState (
                    userId, code, scope, progress, target, unlockedAt, computedAt
                ) VALUES (
                    ?, 'GAMES_50', 'GLOBAL', 10, 50, NULL, '2026-08-20T10:00:00.000Z'
                )
            `).run(ownerId);

            const response = await request(app)
                .get(`/api/users/${ownerId}/achievements`)
                .set('Authorization', ownerAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('achievements');
            expect(response.body).toHaveProperty('progress');
            expect(response.body).toHaveProperty('coverage');

            const mentor = response.body.achievements.find((a: any) => a.code === 'MENTOR');
            expect(mentor).toBeDefined();
            expect(mentor.assignmentId).toBe(assignmentId);
            expect(mentor.awardedAt).toBeDefined();
            expect(mentor.updatedAt).toBeUndefined();

            const games50 = response.body.progress.find((p: any) => p.code === 'GAMES_50');
            expect(games50).toBeDefined();
            expect(games50.progress).toBe(10);
            expect(games50.target).toBe(50);
            expect(games50.updatedAt).toBeDefined();
            expect(games50.awardedAt).toBeUndefined();

            dbManager.db.prepare('DELETE FROM automaticAchievementState WHERE userId = ?').run(ownerId);
            dbManager.db.prepare('DELETE FROM clubUserAchievement WHERE id = ?').run(assignmentId);
        });
    });

    describe('GET /api/clubs/:clubId/achievement-catalog', () => {
        test('returns custom, manual, and automatic catalogs for club owner', async () => {
            const response = await request(app)
                .get(`/api/clubs/${clubId}/achievement-catalog`)
                .set('Authorization', ownerAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('catalog');
            expect(response.body.catalog).toHaveProperty('custom');
            expect(response.body.catalog).toHaveProperty('manual');
            expect(response.body.catalog).toHaveProperty('automatic');
        });
    });

    describe('POST /api/achievements/recompute', () => {
        test('system admin can trigger global recompute', async () => {
            const response = await request(app)
                .post('/api/achievements/recompute')
                .set('Authorization', adminAuthHeader)
                .send({});

            expect(response.status).toBe(202);
            expect(response.body.message).toMatch(/recomputed/i);
        });

        test('club owner can trigger club recompute', async () => {
            const response = await request(app)
                .post('/api/achievements/recompute')
                .set('Authorization', ownerAuthHeader)
                .send({ clubId });

            expect(response.status).toBe(202);
            expect(response.body.message).toMatch(/recomputed/i);
        });

        test('rejects invalid payload with 400', async () => {
            const response = await request(app)
                .post('/api/achievements/recompute')
                .set('Authorization', adminAuthHeader)
                .send({ clubId: 'not-a-number' });

            expect(response.status).toBe(400);
        });

        test('plain member cannot trigger global recompute', async () => {
            const response = await request(app)
                .post('/api/achievements/recompute')
                .set('Authorization', memberAuthHeader)
                .send({});

            expect(response.status).toBe(403);
        });
    });
});
