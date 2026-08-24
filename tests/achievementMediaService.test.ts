import request from 'supertest';
import express from 'express';
import sharp from 'sharp';
import clubRoutes, { achievementController } from '../src/routes/ClubRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createAuthHeader } from './testHelpers.ts';
import { UserService } from '../src/service/UserService.ts';
import { UserRepository } from '../src/repository/UserRepository.ts';
import { ClubMembershipService } from '../src/service/ClubMembershipService.ts';
import { ClubRepository } from '../src/repository/ClubRepository.ts';
import { FakeStorageAdapter } from '../src/service/storage/FakeStorageAdapter.ts';
import { AchievementMediaService } from '../src/service/AchievementMediaService.ts';
import type { StorageAdapter } from '../src/service/storage/StorageAdapter.ts';

const app = express();
app.use(express.json());
app.use('/api/clubs', clubRoutes);
app.use(handleErrors);

describe('AchievementMediaService and POST /api/clubs/:clubId/achievement-icons', () => {
    const SYSTEM_USER_ID = 0;
    let ownerAuthHeader: string;
    let moderatorAuthHeader: string;
    let memberAuthHeader: string;
    let nonMemberAuthHeader: string;

    let ownerId: number;
    let moderatorId: number;
    let memberId: number;
    let nonMemberId: number;
    let clubId: number;

    let fakeStorageAdapter: FakeStorageAdapter;
    let mediaService: AchievementMediaService;

    const membershipService = new ClubMembershipService();
    const clubRepository = new ClubRepository();

    beforeAll(async () => {
        const userService = new UserService();
        const userRepository = new UserRepository();

        const ownerUser = userService.registerUser('MediaOwner', 'media_owner', 777711001, SYSTEM_USER_ID);
        const modUser = userService.registerUser('MediaMod', 'media_mod', 777711002, SYSTEM_USER_ID);
        const memberUser = userService.registerUser('MediaMember', 'media_member', 777711003, SYSTEM_USER_ID);
        const nonMemberUser = userService.registerUser(
            'MediaNonMember',
            'media_non_member',
            777711004,
            SYSTEM_USER_ID
        );

        ownerId = ownerUser.id;
        moderatorId = modUser.id;
        memberId = memberUser.id;
        nonMemberId = nonMemberUser.id;

        userRepository.updateUserStatus(ownerId, true, 'ACTIVE', SYSTEM_USER_ID);
        userRepository.updateUserStatus(moderatorId, true, 'ACTIVE', SYSTEM_USER_ID);
        userRepository.updateUserStatus(memberId, true, 'ACTIVE', SYSTEM_USER_ID);
        userRepository.updateUserStatus(nonMemberId, true, 'ACTIVE', SYSTEM_USER_ID);

        ownerAuthHeader = createAuthHeader(ownerId);
        moderatorAuthHeader = createAuthHeader(moderatorId);
        memberAuthHeader = createAuthHeader(memberId);
        nonMemberAuthHeader = createAuthHeader(nonMemberId);

        dbManager.db.prepare('UPDATE user SET isAdmin = 1 WHERE id = ?').run(ownerId);

        clubId = clubRepository.createClub({
            name: 'Media Test Club',
            address: null,
            city: null,
            country: 'UA',
            locale: 'en',
            description: null,
            contactInfo: null,
            isActive: true,
            createdAt: new Date('2026-04-01T10:00:00.000Z'),
            modifiedBy: ownerId,
        });

        membershipService.createActiveMembership(clubId, ownerId, ownerId);
        membershipService.updateMemberRole(clubId, ownerId, 'OWNER', ownerId);

        membershipService.createActiveMembership(clubId, moderatorId, ownerId);
        membershipService.updateMemberRole(clubId, moderatorId, 'MODERATOR', ownerId);

        membershipService.createActiveMembership(clubId, memberId, ownerId);
        membershipService.updateMemberRole(clubId, memberId, 'MEMBER', ownerId);

        dbManager.db.prepare('UPDATE user SET isAdmin = 0 WHERE id = ?').run(ownerId);

        fakeStorageAdapter = new FakeStorageAdapter();
        mediaService = new AchievementMediaService(fakeStorageAdapter);
        achievementController.setMediaService(mediaService);
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM clubAchievementDefinition WHERE clubId = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?, ?, ?)').run(
            ownerId,
            moderatorId,
            memberId,
            nonMemberId
        );
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('Upload authorization and validations', () => {
        test('club owner can upload a PNG and receive 512x512 normalized WebP URL', async () => {
            const pngBuffer = await sharp({
                create: {
                    width: 200,
                    height: 200,
                    channels: 4,
                    background: { r: 255, g: 0, b: 0, alpha: 0.8 },
                },
            }).png().toBuffer();

            const response = await request(app)
                .post(`/api/clubs/${clubId}/achievement-icons`)
                .set('Authorization', ownerAuthHeader)
                .attach('file', pngBuffer, 'test_badge.png');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('iconUrl');
            expect(response.body.iconUrl).toContain('https://firebasestorage.googleapis.com/v0/b/');
            expect(response.body.iconUrl).toContain(`achievement-icons%2Fcustom%2F${clubId}%2F`);
            expect(response.body.iconUrl).toContain('.webp');

            // Verify stored buffer is normalized to 512x512 WebP
            const uploadedKey = Array.from(fakeStorageAdapter.uploads.keys())[0]!;
            const uploaded = fakeStorageAdapter.uploads.get(uploadedKey)!;
            expect(uploaded.contentType).toBe('image/webp');
            const meta = await sharp(uploaded.buffer).metadata();
            expect(meta.format).toBe('webp');
            expect(meta.width).toBe(512);
            expect(meta.height).toBe(512);
        });

        test('club moderator can upload a JPEG', async () => {
            const jpegBuffer = await sharp({
                create: {
                    width: 300,
                    height: 150,
                    channels: 3,
                    background: { r: 0, g: 255, b: 0 },
                },
            }).jpeg().toBuffer();

            const response = await request(app)
                .post(`/api/clubs/${clubId}/achievement-icons`)
                .set('Authorization', moderatorAuthHeader)
                .attach('icon', jpegBuffer, 'test_badge.jpg');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('iconUrl');
        });

        test('plain member is forbidden from uploading', async () => {
            const pngBuffer = await sharp({
                create: {
                    width: 50,
                    height: 50,
                    channels: 4,
                    background: { r: 0, g: 0, b: 255, alpha: 1 },
                },
            }).png().toBuffer();

            const response = await request(app)
                .post(`/api/clubs/${clubId}/achievement-icons`)
                .set('Authorization', memberAuthHeader)
                .attach('file', pngBuffer, 'test.png');

            expect(response.status).toBe(403);
        });

        test('non-member is forbidden from uploading', async () => {
            const pngBuffer = await sharp({
                create: {
                    width: 50,
                    height: 50,
                    channels: 4,
                    background: { r: 0, g: 0, b: 255, alpha: 1 },
                },
            }).png().toBuffer();

            const response = await request(app)
                .post(`/api/clubs/${clubId}/achievement-icons`)
                .set('Authorization', nonMemberAuthHeader)
                .attach('file', pngBuffer, 'test.png');

            expect(response.status).toBe(403);
        });

        test('rejects non-image payload with 400', async () => {
            const textBuffer = Buffer.from('this is not an image file');

            const response = await request(app)
                .post(`/api/clubs/${clubId}/achievement-icons`)
                .set('Authorization', ownerAuthHeader)
                .attach('file', textBuffer, 'fake.png');

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('invalidImageFile');
        });

        test('rejects request with no file attached with 400', async () => {
            const response = await request(app)
                .post(`/api/clubs/${clubId}/achievement-icons`)
                .set('Authorization', ownerAuthHeader);

            expect(response.status).toBe(400);
            expect(response.body.errorCode).toBe('noImageFileProvided');
        });

        test('returns 500 when storage adapter throws', async () => {
            const failingAdapter: StorageAdapter = {
                uploadImage: async () => {
                    throw new Error('Network error');
                },
            };
            const failingMediaService = new AchievementMediaService(failingAdapter);
            achievementController.setMediaService(failingMediaService);

            const pngBuffer = await sharp({
                create: {
                    width: 50,
                    height: 50,
                    channels: 4,
                    background: { r: 0, g: 0, b: 0, alpha: 1 },
                },
            }).png().toBuffer();

            const response = await request(app)
                .post(`/api/clubs/${clubId}/achievement-icons`)
                .set('Authorization', ownerAuthHeader)
                .attach('file', pngBuffer, 'test.png');

            expect(response.status).toBe(500);
            expect(response.body.errorCode).toBe('imageUploadFailed');

            // Restore healthy mediaService
            achievementController.setMediaService(mediaService);
        });
    });

    describe('Custom definition icon URL validation up to 2048 characters', () => {
        test('creates custom achievement with full HTTPS icon URL', async () => {
            const iconUrl =
                'https://firebasestorage.googleapis.com/v0/b/dojo-games.firebasestorage.app/o/achievement-icons%2Fcustom%2F1%2F' +
                'a'.repeat(200) + '.webp?alt=media';

            const response = await request(app)
                .post(`/api/clubs/${clubId}/achievement-catalog`)
                .set('Authorization', ownerAuthHeader)
                .send({
                    name: 'Firebase Badge Trophy',
                    description: 'Trophy with uploaded image',
                    icon: iconUrl,
                });

            expect(response.status).toBe(201);
            expect(response.body.icon).toBe(iconUrl);
        });

        test('rejects icon longer than 2048 characters', async () => {
            const oversizedIconUrl = 'https://firebasestorage.googleapis.com/' + 'a'.repeat(2050);

            const response = await request(app)
                .post(`/api/clubs/${clubId}/achievement-catalog`)
                .set('Authorization', ownerAuthHeader)
                .send({
                    name: 'Too Long Icon Trophy',
                    description: 'desc',
                    icon: oversizedIconUrl,
                });

            expect(response.status).toBe(400);
        });
    });
});
