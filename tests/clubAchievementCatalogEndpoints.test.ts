import request from 'supertest';
import express from 'express';
import clubRoutes from '../src/routes/ClubRoutes.ts';
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
app.use('/api/clubs', clubRoutes);
app.use(handleErrors);

describe('Club achievement catalog endpoints', () => {
    const SYSTEM_USER_ID = 0;

    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);
    let ownerAuthHeader: string;
    let moderatorAuthHeader: string;
    let memberAuthHeader: string;

    let ownerId: number;
    let moderatorId: number;
    let memberId: number;
    let clubId: number;

    const membershipService = new ClubMembershipService();
    const clubRepository = new ClubRepository();

    beforeAll(() => {
        const userService = new UserService();
        const userRepository = new UserRepository();

        const ownerUser = userService.registerUser('AchOwner', 'ach_owner', 666677701, SYSTEM_USER_ID);
        const moderatorUser = userService.registerUser('AchModerator', 'ach_moderator', 666677702, SYSTEM_USER_ID);
        const memberUser = userService.registerUser('AchMember', 'ach_member', 666677703, SYSTEM_USER_ID);

        ownerId = ownerUser.id;
        moderatorId = moderatorUser.id;
        memberId = memberUser.id;

        userRepository.updateUserStatus(ownerId, true, 'ACTIVE', SYSTEM_USER_ID);
        userRepository.updateUserStatus(moderatorId, true, 'ACTIVE', SYSTEM_USER_ID);
        userRepository.updateUserStatus(memberId, true, 'ACTIVE', SYSTEM_USER_ID);

        ownerAuthHeader = createAuthHeader(ownerId);
        moderatorAuthHeader = createAuthHeader(moderatorId);
        memberAuthHeader = createAuthHeader(memberId);

        clubId = clubRepository.createClub({
            name: 'Achievement Endpoint Club',
            address: null,
            city: null,
            country: 'UA',
            locale: 'uk',
            description: null,
            contactInfo: null,
            isActive: true,
            createdAt: new Date('2026-04-01T10:00:00.000Z'),
            modifiedBy: SYSTEM_USER_ID,
        });

        membershipService.createActiveMembership(clubId, ownerId, SYSTEM_USER_ID);
        membershipService.updateMemberRole(clubId, ownerId, 'OWNER', SYSTEM_USER_ID);
        membershipService.createActiveMembership(clubId, moderatorId, SYSTEM_USER_ID);
        membershipService.updateMemberRole(clubId, moderatorId, 'MODERATOR', SYSTEM_USER_ID);
        membershipService.createActiveMembership(clubId, memberId, SYSTEM_USER_ID);
    });

    afterEach(() => {
        dbManager.db.prepare('DELETE FROM clubUserAchievement WHERE clubId = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM clubAchievementDefinition WHERE clubId = ?').run(clubId);
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('GET /api/clubs/:clubId/achievement-catalog', () => {
        test('owner can list the catalog', async () => {
            const response = await request(app)
                .get(`/api/clubs/${clubId}/achievement-catalog`)
                .set('Authorization', ownerAuthHeader);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('catalog');
            expect(Array.isArray(response.body.catalog)).toBe(true);
        });

        test('plain member is forbidden', async () => {
            const response = await request(app)
                .get(`/api/clubs/${clubId}/achievement-catalog`)
                .set('Authorization', memberAuthHeader);

            expect(response.status).toBe(403);
        });

        test('unauthenticated request is rejected', async () => {
            const response = await request(app).get(`/api/clubs/${clubId}/achievement-catalog`);
            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/clubs/:clubId/achievement-catalog', () => {
        test('moderator can create a definition', async () => {
            const response = await request(app)
                .post(`/api/clubs/${clubId}/achievement-catalog`)
                .set('Authorization', moderatorAuthHeader)
                .send({ name: 'Community Builder', description: 'Helped grow the club.' });

            expect(response.status).toBe(201);
            expect(response.body).toMatchObject({
                clubId,
                name: 'Community Builder',
                description: 'Helped grow the club.',
                archivedAt: null,
            });
        });

        test('system admin can create a definition without club membership', async () => {
            const response = await request(app)
                .post(`/api/clubs/${clubId}/achievement-catalog`)
                .set('Authorization', adminAuthHeader)
                .send({ name: 'Admin Made', description: 'Created by admin.' });

            expect(response.status).toBe(201);
        });

        test('plain member is forbidden', async () => {
            const response = await request(app)
                .post(`/api/clubs/${clubId}/achievement-catalog`)
                .set('Authorization', memberAuthHeader)
                .send({ name: 'Nope', description: 'desc' });

            expect(response.status).toBe(403);
        });

        test('rejects a duplicate active name (case-insensitive)', async () => {
            await request(app)
                .post(`/api/clubs/${clubId}/achievement-catalog`)
                .set('Authorization', ownerAuthHeader)
                .send({ name: 'Mentor', description: 'desc' });

            const response = await request(app)
                .post(`/api/clubs/${clubId}/achievement-catalog`)
                .set('Authorization', ownerAuthHeader)
                .send({ name: 'mentor', description: 'desc' });

            expect(response.status).toBe(400);
        });

        test('rejects a name over 80 characters', async () => {
            const response = await request(app)
                .post(`/api/clubs/${clubId}/achievement-catalog`)
                .set('Authorization', ownerAuthHeader)
                .send({ name: 'x'.repeat(81), description: 'desc' });

            expect(response.status).toBe(400);
        });

        test('rejects a description over 500 characters', async () => {
            const response = await request(app)
                .post(`/api/clubs/${clubId}/achievement-catalog`)
                .set('Authorization', ownerAuthHeader)
                .send({ name: 'Too Long Desc', description: 'x'.repeat(501) });

            expect(response.status).toBe(400);
        });
    });

    describe('PATCH /api/clubs/:clubId/achievement-catalog/:definitionId', () => {
        async function createDefinition(name: string): Promise<number> {
            const response = await request(app)
                .post(`/api/clubs/${clubId}/achievement-catalog`)
                .set('Authorization', ownerAuthHeader)
                .send({ name, description: 'desc' });
            return response.body.id;
        }

        test('owner can archive and unarchive a definition', async () => {
            const definitionId = await createDefinition('Rules Expert');

            const archiveResponse = await request(app)
                .patch(`/api/clubs/${clubId}/achievement-catalog/${definitionId}`)
                .set('Authorization', ownerAuthHeader)
                .send({ archived: true });

            expect(archiveResponse.status).toBe(200);
            expect(archiveResponse.body.archivedAt).not.toBeNull();

            const unarchiveResponse = await request(app)
                .patch(`/api/clubs/${clubId}/achievement-catalog/${definitionId}`)
                .set('Authorization', ownerAuthHeader)
                .send({ archived: false });

            expect(unarchiveResponse.status).toBe(200);
            expect(unarchiveResponse.body.archivedAt).toBeNull();
        });

        test('plain member is forbidden', async () => {
            const definitionId = await createDefinition('Iron Will Test');

            const response = await request(app)
                .patch(`/api/clubs/${clubId}/achievement-catalog/${definitionId}`)
                .set('Authorization', memberAuthHeader)
                .send({ archived: true });

            expect(response.status).toBe(403);
        });

        test('404s for a definition id that does not exist', async () => {
            const response = await request(app)
                .patch(`/api/clubs/${clubId}/achievement-catalog/999999`)
                .set('Authorization', ownerAuthHeader)
                .send({ archived: true });

            expect(response.status).toBe(404);
        });
    });
});
