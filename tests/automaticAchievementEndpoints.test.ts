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
        test('returns localized automatic achievement catalog', async () => {
            const response = await request(app)
                .get('/api/achievements/catalog')
                .set('Authorization', ownerAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('catalog');
            expect(Array.isArray(response.body.catalog)).toBe(true);
            expect(response.body.catalog.length).toBeGreaterThan(50);
            expect(response.body.catalog[0]).toHaveProperty('code');
            expect(response.body.catalog[0]).toHaveProperty('name');
            expect(response.body.catalog[0]).toHaveProperty('description');
        });
    });

    describe('GET /api/users/:id/achievements', () => {
        test('returns user achievements, progress, and coverage', async () => {
            const response = await request(app)
                .get(`/api/users/${ownerId}/achievements`)
                .set('Authorization', ownerAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('achievements');
            expect(response.body).toHaveProperty('progress');
            expect(response.body).toHaveProperty('coverage');
            expect(Array.isArray(response.body.achievements)).toBe(true);
            expect(Array.isArray(response.body.progress)).toBe(true);
            expect(response.body.coverage).toHaveProperty('unlockedCount');
            expect(response.body.coverage).toHaveProperty('totalCount');
            expect(response.body.coverage).toHaveProperty('percentage');
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

            expect(response.status).toBe(200);
            expect(response.body.message).toMatch(/recomputed/i);
        });

        test('club owner can trigger club recompute', async () => {
            const response = await request(app)
                .post('/api/achievements/recompute')
                .set('Authorization', ownerAuthHeader)
                .send({ clubId });

            expect(response.status).toBe(200);
            expect(response.body.message).toMatch(/recomputed/i);
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
