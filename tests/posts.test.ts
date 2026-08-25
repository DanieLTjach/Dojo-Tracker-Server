import request from 'supertest';
import express from 'express';
import postRoutes from '../src/routes/PostRoutes.ts';
import userRoutes from '../src/routes/UserRoutes.ts';
import clubRoutes from '../src/routes/ClubRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { createAuthHeader, createTelegramInitData, resetTestDatabase } from './testHelpers.ts';
import { ClubMembershipService } from '../src/service/ClubMembershipService.ts';

const app = express();
app.use(express.json());
app.use('/api', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clubs', clubRoutes);
app.use(handleErrors);

describe('Posts API Endpoints', () => {
    const SYSTEM_USER_ID = 0;
    const adminAuthHeader = createAuthHeader(SYSTEM_USER_ID);

    let authorId: number;
    let authorAuthHeader: string;
    let otherUserId: number;
    let otherUserAuthHeader: string;
    let testClubId: number;
    const membershipService = new ClubMembershipService();

    beforeAll(async () => {
        // Register author
        const initData1 = createTelegramInitData(300100100, 'postauthor');
        const res1 = await request(app)
            .post('/api/users')
            .query(initData1)
            .send({ name: 'Post Author User' })
            .expect(201);
        authorId = res1.body.id;

        await request(app)
            .post(`/api/users/${authorId}/activate`)
            .set('Authorization', adminAuthHeader)
            .send({});
        authorAuthHeader = createAuthHeader(authorId);

        // Register other user
        const initData2 = createTelegramInitData(300200200, 'postother');
        const res2 = await request(app)
            .post('/api/users')
            .query(initData2)
            .send({ name: 'Post Other User' })
            .expect(201);
        otherUserId = res2.body.id;

        await request(app)
            .post(`/api/users/${otherUserId}/activate`)
            .set('Authorization', adminAuthHeader)
            .send({});
        otherUserAuthHeader = createAuthHeader(otherUserId);

        // Create a test club with adminAuthHeader
        const clubRes = await request(app)
            .post('/api/clubs')
            .set('Authorization', adminAuthHeader)
            .send({ name: 'Post Test Club', city: 'Kyiv', country: 'UA', locale: 'uk' })
            .expect(201);
        testClubId = clubRes.body.id;

        // Make author the owner of the club
        await request(app)
            .post(`/api/clubs/${testClubId}/join`)
            .set('Authorization', authorAuthHeader);
        membershipService.activateMember(testClubId, authorId, SYSTEM_USER_ID);
        membershipService.updateMemberRole(testClubId, authorId, 'OWNER', SYSTEM_USER_ID);
    });

    afterAll(() => {
        resetTestDatabase();
    });

    it('creates a post successfully and returns full post object', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({
                clubId: testClubId,
                text: 'First game at the new club! 🀄',
                images: [
                    { url: 'https://example.com/img1.jpg', width: 800, height: 600 },
                    { url: 'https://example.com/img2.jpg', width: 800, height: 600 },
                ],
            })
            .expect(201);

        expect(createRes.body).toMatchObject({
            authorId,
            clubId: testClubId,
            text: 'First game at the new club! 🀄',
            likeCount: 0,
            likedByMe: false,
        });
        expect(createRes.body.images).toHaveLength(2);
        expect(createRes.body.author.name).toBe('Post Author User');

        const postId = createRes.body.id;

        // Fetch post by ID
        const getRes = await request(app)
            .get(`/api/posts/${postId}`)
            .set('Authorization', authorAuthHeader)
            .expect(200);

        expect(getRes.body.id).toBe(postId);
        expect(getRes.body.images).toHaveLength(2);
    });

    it('validates image count and text length', async () => {
        // 0 images -> bad request
        await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({
                text: 'No images here',
                images: [],
            })
            .expect(400);

        // > 4 images -> bad request
        await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({
                text: 'Too many images',
                images: [
                    { url: 'https://example.com/1.jpg' },
                    { url: 'https://example.com/2.jpg' },
                    { url: 'https://example.com/3.jpg' },
                    { url: 'https://example.com/4.jpg' },
                    { url: 'https://example.com/5.jpg' },
                ],
            })
            .expect(400);

        // text > 280 chars -> bad request
        await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({
                text: 'a'.repeat(281),
                images: [{ url: 'https://example.com/1.jpg' }],
            })
            .expect(400);
    });

    it('lists user posts and club posts', async () => {
        // Create another post without club
        await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({
                text: 'Personal photo',
                images: [{ url: 'https://example.com/personal.jpg' }],
            })
            .expect(201);

        // Get user posts
        const userPostsRes = await request(app)
            .get(`/api/users/${authorId}/posts`)
            .expect(200);

        expect(userPostsRes.body.length).toBeGreaterThanOrEqual(2);

        // Get club posts
        const clubPostsRes = await request(app)
            .get(`/api/clubs/${testClubId}/posts`)
            .expect(200);

        expect(clubPostsRes.body.length).toBe(1);
        expect(clubPostsRes.body[0].clubId).toBe(testClubId);
    });

    it('handles liking and unliking posts', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({
                text: 'Like me!',
                images: [{ url: 'https://example.com/like.jpg' }],
            })
            .expect(201);

        const postId = createRes.body.id;

        // Other user likes the post
        await request(app)
            .post(`/api/posts/${postId}/like`)
            .set('Authorization', otherUserAuthHeader)
            .expect(200);

        const afterLikeRes = await request(app)
            .get(`/api/posts/${postId}`)
            .set('Authorization', otherUserAuthHeader)
            .expect(200);

        expect(afterLikeRes.body.likeCount).toBe(1);
        expect(afterLikeRes.body.likedByMe).toBe(true);

        // Other user unlikes the post
        await request(app)
            .delete(`/api/posts/${postId}/like`)
            .set('Authorization', otherUserAuthHeader)
            .expect(200);

        const afterUnlikeRes = await request(app)
            .get(`/api/posts/${postId}`)
            .set('Authorization', otherUserAuthHeader)
            .expect(200);

        expect(afterUnlikeRes.body.likeCount).toBe(0);
        expect(afterUnlikeRes.body.likedByMe).toBe(false);
    });

    it('enforces deletion permissions', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({
                text: 'To be deleted',
                images: [{ url: 'https://example.com/delete.jpg' }],
            })
            .expect(201);

        const postId = createRes.body.id;

        // Other user cannot delete author post
        await request(app)
            .delete(`/api/posts/${postId}`)
            .set('Authorization', otherUserAuthHeader)
            .expect(403);

        // Author can delete own post
        await request(app)
            .delete(`/api/posts/${postId}`)
            .set('Authorization', authorAuthHeader)
            .expect(204);

        // Post is gone
        await request(app)
            .get(`/api/posts/${postId}`)
            .expect(404);
    });
});
