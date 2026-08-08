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

describe('Club achievement assignment endpoints', () => {
    const SYSTEM_USER_ID = 0;

    let ownerAuthHeader: string;
    let memberAuthHeader: string;

    let ownerId: number;
    let memberId: number;
    let inactiveMemberId: number;
    let clubId: number;

    const membershipService = new ClubMembershipService();
    const clubRepository = new ClubRepository();

    beforeAll(() => {
        const userService = new UserService();
        const userRepository = new UserRepository();

        const ownerUser = userService.registerUser('AssignOwner', 'assign_owner', 666677801, SYSTEM_USER_ID);
        const memberUser = userService.registerUser('AssignMember', 'assign_member', 666677802, SYSTEM_USER_ID);
        const inactiveUser = userService.registerUser(
            'AssignInactive',
            'assign_inactive',
            666677803,
            SYSTEM_USER_ID
        );

        ownerId = ownerUser.id;
        memberId = memberUser.id;
        inactiveMemberId = inactiveUser.id;

        userRepository.updateUserStatus(ownerId, true, 'ACTIVE', SYSTEM_USER_ID);
        userRepository.updateUserStatus(memberId, true, 'ACTIVE', SYSTEM_USER_ID);
        userRepository.updateUserStatus(inactiveMemberId, true, 'ACTIVE', SYSTEM_USER_ID);

        ownerAuthHeader = createAuthHeader(ownerId);
        memberAuthHeader = createAuthHeader(memberId);

        clubId = clubRepository.createClub({
            name: 'Assignment Endpoint Club',
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
        membershipService.createActiveMembership(clubId, memberId, SYSTEM_USER_ID);
        membershipService.requestJoin(clubId, inactiveMemberId, inactiveMemberId);
        membershipService.activateMember(clubId, inactiveMemberId, SYSTEM_USER_ID);
        membershipService.deactivateMember(clubId, inactiveMemberId, SYSTEM_USER_ID);
    });

    afterEach(() => {
        dbManager.db.prepare('DELETE FROM clubUserAchievement WHERE clubId = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM clubAchievementDefinition WHERE clubId = ?').run(clubId);
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('POST /api/clubs/:clubId/members/:userId/achievements', () => {
        test('owner can assign a built-in achievement', async () => {
            const response = await request(app)
                .post(`/api/clubs/${clubId}/members/${memberId}/achievements`)
                .set('Authorization', ownerAuthHeader)
                .send({ builtInCode: 'MENTOR', note: 'Great mentor' });

            expect(response.status).toBe(201);
            expect(response.body).toMatchObject({
                clubId,
                userId: memberId,
                builtInCode: 'MENTOR',
                note: 'Great mentor',
                revokedAt: null,
            });
        });

        test('owner can atomically create-and-assign a new definition', async () => {
            const response = await request(app)
                .post(`/api/clubs/${clubId}/members/${memberId}/achievements`)
                .set('Authorization', ownerAuthHeader)
                .send({ newDefinition: { name: 'Fresh Award', description: 'desc' } });

            expect(response.status).toBe(201);
            expect(response.body.definitionId).not.toBeNull();

            const catalogResponse = await request(app)
                .get(`/api/clubs/${clubId}/achievement-catalog`)
                .set('Authorization', ownerAuthHeader);
            expect(catalogResponse.body.catalog.map((d: { name: string }) => d.name)).toContain('Fresh Award');
        });

        test('plain member is forbidden', async () => {
            const response = await request(app)
                .post(`/api/clubs/${clubId}/members/${memberId}/achievements`)
                .set('Authorization', memberAuthHeader)
                .send({ builtInCode: 'MENTOR' });

            expect(response.status).toBe(403);
        });

        test('rejects assigning to an inactive member', async () => {
            const response = await request(app)
                .post(`/api/clubs/${clubId}/members/${inactiveMemberId}/achievements`)
                .set('Authorization', ownerAuthHeader)
                .send({ builtInCode: 'MENTOR' });

            expect(response.status).toBe(400);
        });

        test('rejects a body with no source or multiple sources', async () => {
            const emptyResponse = await request(app)
                .post(`/api/clubs/${clubId}/members/${memberId}/achievements`)
                .set('Authorization', ownerAuthHeader)
                .send({});
            expect(emptyResponse.status).toBe(400);

            const multipleResponse = await request(app)
                .post(`/api/clubs/${clubId}/members/${memberId}/achievements`)
                .set('Authorization', ownerAuthHeader)
                .send({ builtInCode: 'MENTOR', definitionId: 1 });
            expect(multipleResponse.status).toBe(400);
        });

        test('rejects a duplicate active assignment of the same built-in achievement', async () => {
            await request(app)
                .post(`/api/clubs/${clubId}/members/${memberId}/achievements`)
                .set('Authorization', ownerAuthHeader)
                .send({ builtInCode: 'RISING_STAR' });

            const response = await request(app)
                .post(`/api/clubs/${clubId}/members/${memberId}/achievements`)
                .set('Authorization', ownerAuthHeader)
                .send({ builtInCode: 'RISING_STAR' });

            expect(response.status).toBe(400);
        });
    });

    describe('POST /api/clubs/:clubId/members/:userId/achievements/:assignmentId/revoke', () => {
        test('owner can revoke an assignment', async () => {
            const assignResponse = await request(app)
                .post(`/api/clubs/${clubId}/members/${memberId}/achievements`)
                .set('Authorization', ownerAuthHeader)
                .send({ builtInCode: 'IRON_WILL' });
            const assignmentId = assignResponse.body.id;

            const revokeResponse = await request(app)
                .post(`/api/clubs/${clubId}/members/${memberId}/achievements/${assignmentId}/revoke`)
                .set('Authorization', ownerAuthHeader);

            expect(revokeResponse.status).toBe(200);
            expect(revokeResponse.body.revokedAt).not.toBeNull();
        });

        test('plain member is forbidden', async () => {
            const assignResponse = await request(app)
                .post(`/api/clubs/${clubId}/members/${memberId}/achievements`)
                .set('Authorization', ownerAuthHeader)
                .send({ builtInCode: 'HOSPITALITY_HERO' });
            const assignmentId = assignResponse.body.id;

            const response = await request(app)
                .post(`/api/clubs/${clubId}/members/${memberId}/achievements/${assignmentId}/revoke`)
                .set('Authorization', memberAuthHeader);

            expect(response.status).toBe(403);
        });

        test('404s for an assignment id that does not exist', async () => {
            const response = await request(app)
                .post(`/api/clubs/${clubId}/members/${memberId}/achievements/999999/revoke`)
                .set('Authorization', ownerAuthHeader);

            expect(response.status).toBe(404);
        });
    });
});
