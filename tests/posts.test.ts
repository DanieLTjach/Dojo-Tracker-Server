import request from 'supertest';
import express from 'express';
import postRoutes from '../src/routes/PostRoutes.ts';
import gameRoutes from '../src/routes/GameRoutes.ts';
import userRoutes from '../src/routes/UserRoutes.ts';
import clubRoutes from '../src/routes/ClubRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { createAuthHeader, createTelegramInitData, createCustomEvent, resetTestDatabase } from './testHelpers.ts';
import { ClubMembershipService } from '../src/service/ClubMembershipService.ts';

const app = express();
app.use(express.json());
app.use('/api', postRoutes);
app.use('/api/games', gameRoutes);
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
    it('lets the author edit the caption and marks the post edited', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({
                text: 'Original caption',
                clubId: testClubId,
                images: [{ url: 'https://example.com/edit.jpg' }],
            })
            .expect(201);
        const postId = createRes.body.id;
        expect(createRes.body.editedAt).toBeNull();

        const editRes = await request(app)
            .patch(`/api/posts/${postId}`)
            .set('Authorization', authorAuthHeader)
            .send({ text: 'Updated caption' })
            .expect(200);

        expect(editRes.body.text).toBe('Updated caption');
        expect(editRes.body.editedAt).toBeTruthy();
        // Omitting clubId must not clear it - only the sent fields are written.
        expect(editRes.body.clubId).toBe(testClubId);
        // Images are not editable, and must survive a caption edit untouched.
        expect(editRes.body.images).toHaveLength(1);
    });

    it('refuses edits from everyone but the author, including admins', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({
                text: 'Not yours to edit',
                clubId: testClubId,
                images: [{ url: 'https://example.com/noedit.jpg' }],
            })
            .expect(201);
        const postId = createRes.body.id;

        await request(app)
            .patch(`/api/posts/${postId}`)
            .set('Authorization', otherUserAuthHeader)
            .send({ text: 'hijacked' })
            .expect(403);

        // Admins may delete a post but may not rewrite its words.
        await request(app)
            .patch(`/api/posts/${postId}`)
            .set('Authorization', adminAuthHeader)
            .send({ text: 'hijacked by admin' })
            .expect(403);

        const after = await request(app).get(`/api/posts/${postId}`).expect(200);
        expect(after.body.text).toBe('Not yours to edit');
    });

    it('validates edited caption length', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({ text: 'short', images: [{ url: 'https://example.com/len.jpg' }] })
            .expect(201);

        await request(app)
            .patch(`/api/posts/${createRes.body.id}`)
            .set('Authorization', authorAuthHeader)
            .send({ text: 'x'.repeat(281) })
            .expect(400);
    });

    it('lets another user comment, and reflects the count on the post', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({ text: 'Comment me', images: [{ url: 'https://example.com/c.jpg' }] })
            .expect(201);
        const postId = createRes.body.id;
        expect(createRes.body.commentCount).toBe(0);

        const commentRes = await request(app)
            .post(`/api/posts/${postId}/comments`)
            .set('Authorization', otherUserAuthHeader)
            .send({ text: '  Nice hand!  ' })
            .expect(201);

        expect(commentRes.body.text).toBe('Nice hand!');
        expect(commentRes.body.authorId).toBe(otherUserId);
        expect(commentRes.body.author.name).toBe('Post Other User');
        expect(commentRes.body.editedAt).toBeNull();

        const listRes = await request(app).get(`/api/posts/${postId}/comments`).expect(200);
        expect(listRes.body).toHaveLength(1);

        const postRes = await request(app).get(`/api/posts/${postId}`).expect(200);
        expect(postRes.body.commentCount).toBe(1);
    });

    it('rejects empty and overlong comments', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({ text: 'Validation', images: [{ url: 'https://example.com/v.jpg' }] })
            .expect(201);
        const postId = createRes.body.id;

        await request(app)
            .post(`/api/posts/${postId}/comments`)
            .set('Authorization', otherUserAuthHeader)
            .send({ text: '   ' })
            .expect(400);

        await request(app)
            .post(`/api/posts/${postId}/comments`)
            .set('Authorization', otherUserAuthHeader)
            .send({ text: 'x'.repeat(501) })
            .expect(400);
    });

    it('requires auth to comment but not to read comments', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({ text: 'Auth check', images: [{ url: 'https://example.com/a.jpg' }] })
            .expect(201);
        const postId = createRes.body.id;

        await request(app)
            .post(`/api/posts/${postId}/comments`)
            .send({ text: 'anonymous' })
            .expect(401);

        await request(app).get(`/api/posts/${postId}/comments`).expect(200);
    });

    it('lets the comment author edit their own comment only', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({ text: 'Edit comment', images: [{ url: 'https://example.com/ec.jpg' }] })
            .expect(201);

        const commentRes = await request(app)
            .post(`/api/posts/${createRes.body.id}/comments`)
            .set('Authorization', otherUserAuthHeader)
            .send({ text: 'first take' })
            .expect(201);
        const commentId = commentRes.body.id;

        // The post's author does not get to reword someone else's comment.
        await request(app)
            .patch(`/api/comments/${commentId}`)
            .set('Authorization', authorAuthHeader)
            .send({ text: 'rewritten' })
            .expect(403);

        const edited = await request(app)
            .patch(`/api/comments/${commentId}`)
            .set('Authorization', otherUserAuthHeader)
            .send({ text: 'second take' })
            .expect(200);
        expect(edited.body.text).toBe('second take');
        expect(edited.body.editedAt).toBeTruthy();
    });

    it('lets the post author moderate comments on their own post', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({ text: 'Moderation', images: [{ url: 'https://example.com/m.jpg' }] })
            .expect(201);
        const postId = createRes.body.id;

        const commentRes = await request(app)
            .post(`/api/posts/${postId}/comments`)
            .set('Authorization', otherUserAuthHeader)
            .send({ text: 'to be removed' })
            .expect(201);

        await request(app)
            .delete(`/api/comments/${commentRes.body.id}`)
            .set('Authorization', authorAuthHeader)
            .expect(204);

        const listRes = await request(app).get(`/api/posts/${postId}/comments`).expect(200);
        expect(listRes.body).toHaveLength(0);
    });

    it('refuses comment deletion by an unrelated user', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', adminAuthHeader)
            .send({ text: 'Third party', images: [{ url: 'https://example.com/t.jpg' }] })
            .expect(201);

        const commentRes = await request(app)
            .post(`/api/posts/${createRes.body.id}/comments`)
            .set('Authorization', authorAuthHeader)
            .send({ text: 'mine' })
            .expect(201);

        await request(app)
            .delete(`/api/comments/${commentRes.body.id}`)
            .set('Authorization', otherUserAuthHeader)
            .expect(403);
    });

    it('removes a post comments along with the post', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({ text: 'Cascade', images: [{ url: 'https://example.com/cascade.jpg' }] })
            .expect(201);
        const postId = createRes.body.id;

        const commentRes = await request(app)
            .post(`/api/posts/${postId}/comments`)
            .set('Authorization', otherUserAuthHeader)
            .send({ text: 'orphan candidate' })
            .expect(201);

        await request(app)
            .delete(`/api/posts/${postId}`)
            .set('Authorization', authorAuthHeader)
            .expect(204);

        // The comment must go with it rather than linger pointing at nothing.
        await request(app)
            .patch(`/api/comments/${commentRes.body.id}`)
            .set('Authorization', otherUserAuthHeader)
            .send({ text: 'still here?' })
            .expect(404);
    });

    it('404s comments on a post that does not exist', async () => {
        await request(app).get('/api/posts/99999/comments').expect(404);
        await request(app)
            .post('/api/posts/99999/comments')
            .set('Authorization', authorAuthHeader)
            .send({ text: 'nowhere' })
            .expect(404);
    });
    it('likes and unlikes a comment, and counts each user once', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({ text: 'Like my comments', images: [{ url: 'https://example.com/cl.jpg' }] })
            .expect(201);
        const postId = createRes.body.id;

        const commentRes = await request(app)
            .post(`/api/posts/${postId}/comments`)
            .set('Authorization', otherUserAuthHeader)
            .send({ text: 'worth a like' })
            .expect(201);
        const commentId = commentRes.body.id;
        expect(commentRes.body.likeCount).toBe(0);
        expect(commentRes.body.likedByMe).toBe(false);

        await request(app)
            .post(`/api/comments/${commentId}/like`)
            .set('Authorization', authorAuthHeader)
            .expect(200);

        // Liking twice must not double count - the primary key absorbs it.
        await request(app)
            .post(`/api/comments/${commentId}/like`)
            .set('Authorization', authorAuthHeader)
            .expect(200);

        const asLiker = await request(app)
            .get(`/api/posts/${postId}/comments`)
            .set('Authorization', authorAuthHeader)
            .expect(200);
        expect(asLiker.body[0].likeCount).toBe(1);
        expect(asLiker.body[0].likedByMe).toBe(true);

        // likedByMe is per viewer: the comment's own author has not liked it.
        const asOther = await request(app)
            .get(`/api/posts/${postId}/comments`)
            .set('Authorization', otherUserAuthHeader)
            .expect(200);
        expect(asOther.body[0].likeCount).toBe(1);
        expect(asOther.body[0].likedByMe).toBe(false);

        await request(app)
            .delete(`/api/comments/${commentId}/like`)
            .set('Authorization', authorAuthHeader)
            .expect(200);

        const afterUnlike = await request(app).get(`/api/posts/${postId}/comments`).expect(200);
        expect(afterUnlike.body[0].likeCount).toBe(0);
    });

    it('reports no likedByMe for an anonymous reader', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({ text: 'Anon read', images: [{ url: 'https://example.com/an.jpg' }] })
            .expect(201);

        const commentRes = await request(app)
            .post(`/api/posts/${createRes.body.id}/comments`)
            .set('Authorization', authorAuthHeader)
            .send({ text: 'hello' })
            .expect(201);

        await request(app)
            .post(`/api/comments/${commentRes.body.id}/like`)
            .set('Authorization', otherUserAuthHeader)
            .expect(200);

        const anon = await request(app).get(`/api/posts/${createRes.body.id}/comments`).expect(200);
        expect(anon.body[0].likeCount).toBe(1);
        expect(anon.body[0].likedByMe).toBe(false);
    });

    it('requires auth to like a comment and 404s an unknown one', async () => {
        await request(app).post('/api/comments/999999/like').expect(401);
        await request(app)
            .post('/api/comments/999999/like')
            .set('Authorization', authorAuthHeader)
            .expect(404);
    });

    it('drops comment likes when the comment is deleted', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({ text: 'Cascade likes', images: [{ url: 'https://example.com/cc.jpg' }] })
            .expect(201);

        const commentRes = await request(app)
            .post(`/api/posts/${createRes.body.id}/comments`)
            .set('Authorization', otherUserAuthHeader)
            .send({ text: 'doomed' })
            .expect(201);

        await request(app)
            .post(`/api/comments/${commentRes.body.id}/like`)
            .set('Authorization', authorAuthHeader)
            .expect(200);

        await request(app)
            .delete(`/api/comments/${commentRes.body.id}`)
            .set('Authorization', otherUserAuthHeader)
            .expect(204);

        await request(app)
            .post(`/api/comments/${commentRes.body.id}/like`)
            .set('Authorization', authorAuthHeader)
            .expect(404);
    });
    it('replaces a post images with the list it is given', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({
                text: 'Swap my photos',
                images: [
                    { url: 'https://example.com/one.jpg' },
                    { url: 'https://example.com/two.jpg' },
                ],
            })
            .expect(201);
        const postId = createRes.body.id;

        const editRes = await request(app)
            .patch(`/api/posts/${postId}`)
            .set('Authorization', authorAuthHeader)
            .send({
                images: [
                    { url: 'https://example.com/two.jpg' },
                    { url: 'https://example.com/three.jpg' },
                    { url: 'https://example.com/four.jpg' },
                ],
            })
            .expect(200);

        expect(editRes.body.images.map((i: { url: string }) => i.url)).toEqual([
            'https://example.com/two.jpg',
            'https://example.com/three.jpg',
            'https://example.com/four.jpg',
        ]);
        // An images-only edit still counts as an edit.
        expect(editRes.body.editedAt).toBeTruthy();
        // The caption was not sent, so it must be untouched.
        expect(editRes.body.text).toBe('Swap my photos');
    });

    it('keeps the order the images were sent in', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({
                images: [
                    { url: 'https://example.com/a.jpg' },
                    { url: 'https://example.com/b.jpg' },
                    { url: 'https://example.com/c.jpg' },
                ],
            })
            .expect(201);

        // Same three images, reversed - a pure reorder.
        const reordered = await request(app)
            .patch(`/api/posts/${createRes.body.id}`)
            .set('Authorization', authorAuthHeader)
            .send({
                images: [
                    { url: 'https://example.com/c.jpg' },
                    { url: 'https://example.com/b.jpg' },
                    { url: 'https://example.com/a.jpg' },
                ],
            })
            .expect(200);

        expect(reordered.body.images.map((i: { url: string }) => i.url)).toEqual([
            'https://example.com/c.jpg',
            'https://example.com/b.jpg',
            'https://example.com/a.jpg',
        ]);
    });

    it('removes photos down to a single one', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({
                images: [
                    { url: 'https://example.com/keep.jpg' },
                    { url: 'https://example.com/drop1.jpg' },
                    { url: 'https://example.com/drop2.jpg' },
                ],
            })
            .expect(201);

        const trimmed = await request(app)
            .patch(`/api/posts/${createRes.body.id}`)
            .set('Authorization', authorAuthHeader)
            .send({ images: [{ url: 'https://example.com/keep.jpg' }] })
            .expect(200);

        expect(trimmed.body.images).toHaveLength(1);
        expect(trimmed.body.images[0].url).toBe('https://example.com/keep.jpg');
    });

    it('refuses to leave a post with no photos, or with too many', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({ images: [{ url: 'https://example.com/solo.jpg' }] })
            .expect(201);
        const postId = createRes.body.id;

        // Emptying a photo post is a delete, not an edit.
        await request(app)
            .patch(`/api/posts/${postId}`)
            .set('Authorization', authorAuthHeader)
            .send({ images: [] })
            .expect(400);

        await request(app)
            .patch(`/api/posts/${postId}`)
            .set('Authorization', authorAuthHeader)
            .send({
                images: [
                    { url: 'https://example.com/1.jpg' },
                    { url: 'https://example.com/2.jpg' },
                    { url: 'https://example.com/3.jpg' },
                    { url: 'https://example.com/4.jpg' },
                    { url: 'https://example.com/5.jpg' },
                ],
            })
            .expect(400);

        // Neither attempt may have touched the stored set.
        const after = await request(app).get(`/api/posts/${postId}`).expect(200);
        expect(after.body.images).toHaveLength(1);
        expect(after.body.editedAt).toBeNull();
    });

    it('leaves images alone when the caption is edited on its own', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({
                text: 'before',
                images: [
                    { url: 'https://example.com/x.jpg' },
                    { url: 'https://example.com/y.jpg' },
                ],
            })
            .expect(201);

        const edited = await request(app)
            .patch(`/api/posts/${createRes.body.id}`)
            .set('Authorization', authorAuthHeader)
            .send({ text: 'after' })
            .expect(200);

        expect(edited.body.text).toBe('after');
        expect(edited.body.images.map((i: { url: string }) => i.url)).toEqual([
            'https://example.com/x.jpg',
            'https://example.com/y.jpg',
        ]);
    });

    it('refuses image edits from anyone but the author', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({ text: 'mine', images: [{ url: 'https://example.com/mine.jpg' }] })
            .expect(201);

        await request(app)
            .patch(`/api/posts/${createRes.body.id}`)
            .set('Authorization', otherUserAuthHeader)
            .send({ images: [{ url: 'https://example.com/theirs.jpg' }] })
            .expect(403);

        const after = await request(app).get(`/api/posts/${createRes.body.id}`).expect(200);
        expect(after.body.images[0].url).toBe('https://example.com/mine.jpg');
    });

    it('edits the caption, club and images together', async () => {
        const createRes = await request(app)
            .post('/api/posts')
            .set('Authorization', authorAuthHeader)
            .send({ text: 'all at once', images: [{ url: 'https://example.com/old.jpg' }] })
            .expect(201);

        const edited = await request(app)
            .patch(`/api/posts/${createRes.body.id}`)
            .set('Authorization', authorAuthHeader)
            .send({
                text: 'updated',
                clubId: testClubId,
                images: [{ url: 'https://example.com/new.jpg' }],
            })
            .expect(200);

        expect(edited.body.text).toBe('updated');
        expect(edited.body.clubId).toBe(testClubId);
        expect(edited.body.images[0].url).toBe('https://example.com/new.jpg');
    });

    describe('Game and round linked posts', () => {
        let testGameId: number;
        let nonParticipantId: number;
        let nonParticipantAuthHeader: string;

        beforeAll(async () => {
            // Register 2 more users to form a 4-player game
            const res3 = await request(app)
                .post('/api/users')
                .query(createTelegramInitData(300300300, 'postp3'))
                .send({ name: 'Post Player 3' })
                .expect(201);
            const user3Id = res3.body.id;
            await request(app).post(`/api/users/${user3Id}/activate`).set('Authorization', adminAuthHeader).send({});

            const res4 = await request(app)
                .post('/api/users')
                .query(createTelegramInitData(300400400, 'postp4'))
                .send({ name: 'Post Player 4' })
                .expect(201);
            const user4Id = res4.body.id;
            await request(app).post(`/api/users/${user4Id}/activate`).set('Authorization', adminAuthHeader).send({});

            // Register non-participant
            const resNonPart = await request(app)
                .post('/api/users')
                .query(createTelegramInitData(300500500, 'postnonpart'))
                .send({ name: 'Non Participant' })
                .expect(201);
            nonParticipantId = resNonPart.body.id;
            await request(app).post(`/api/users/${nonParticipantId}/activate`).set('Authorization', adminAuthHeader)
                .send({});
            nonParticipantAuthHeader = createAuthHeader(nonParticipantId);

            // Create custom event
            createCustomEvent(
                888,
                'Posts Game Event',
                '2020-01-01T00:00:00.000Z',
                '2030-01-01T00:00:00.000Z',
                2,
                testClubId
            );

            // Create tracked game with author, otherUser, user3, user4
            const gameRes = await request(app)
                .post('/api/games/tracked')
                .set('Authorization', authorAuthHeader)
                .send({
                    eventId: 888,
                    players: [
                        { userId: authorId, startPlace: 'EAST' },
                        { userId: otherUserId, startPlace: 'SOUTH' },
                        { userId: user3Id, startPlace: 'WEST' },
                        { userId: user4Id, startPlace: 'NORTH' },
                    ],
                })
                .expect(201);
            testGameId = gameRes.body.id;

            // Post round 1
            await request(app)
                .post(`/api/games/${testGameId}/rounds/1`)
                .set('Authorization', authorAuthHeader)
                .send({
                    type: 'EXHAUSTIVE_DRAW',
                    tenpaiPlayerIds: [authorId],
                    riichiPlayerIds: [],
                    nagashiManganPlayerIds: [],
                })
                .expect(200);
        });

        it('accepts round link for a participant and hydrates round fields', async () => {
            const createRes = await request(app)
                .post('/api/posts')
                .set('Authorization', authorAuthHeader)
                .send({
                    gameId: testGameId,
                    roundNumber: 1,
                    clubId: testClubId,
                    images: [{ url: 'https://example.com/hand1.webp' }],
                })
                .expect(201);

            expect(createRes.body.gameId).toBe(testGameId);
            expect(createRes.body.roundNumber).toBe(1);
            expect(createRes.body.game).toBeDefined();
            expect(createRes.body.game.id).toBe(testGameId);
            expect(createRes.body.game.roundNumber).toBe(1);
            expect(createRes.body.game.wind).toBe('EAST');
            expect(createRes.body.game.dealerNumber).toBe(1);

            // Verify GET /api/games/:gameId/posts returns the post with round data
            const gamePostsRes = await request(app)
                .get(`/api/games/${testGameId}/posts`)
                .expect(200);

            expect(Array.isArray(gamePostsRes.body)).toBe(true);
            const found = gamePostsRes.body.find((p: any) => p.id === createRes.body.id);
            expect(found).toBeDefined();
            expect(found.roundNumber).toBe(1);
            expect(found.game.wind).toBe('EAST');
            expect(found.game.dealerNumber).toBe(1);
        });

        it('rejects post with gameId from a non-participant', async () => {
            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', nonParticipantAuthHeader)
                .send({
                    gameId: testGameId,
                    roundNumber: 1,
                    images: [{ url: 'https://example.com/hand-cheat.webp' }],
                })
                .expect(403);

            expect(res.body.errorCode).toBe('notGameParticipant');
        });

        it('rejects post when gameId does not exist', async () => {
            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', authorAuthHeader)
                .send({
                    gameId: 999999,
                    images: [{ url: 'https://example.com/hand-none.webp' }],
                })
                .expect(404);

            expect(res.body.errorCode).toBe('gameNotFound');
        });

        it('rejects roundNumber without gameId', async () => {
            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', authorAuthHeader)
                .send({
                    roundNumber: 1,
                    images: [{ url: 'https://example.com/hand-no-game.webp' }],
                })
                .expect(400);

            expect(res.body.errorCode).toBe('roundRequiresGame');
        });

        it('rejects nonexistent (gameId, roundNumber) pair', async () => {
            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', authorAuthHeader)
                .send({
                    gameId: testGameId,
                    roundNumber: 99,
                    images: [{ url: 'https://example.com/hand-bad-round.webp' }],
                })
                .expect(404);

            expect(res.body.errorCode).toBe('gameRoundNotFound');
        });

        it('nulls the link and keeps the post on round rollback', async () => {
            // Create a post linked to round 1
            const createRes = await request(app)
                .post('/api/posts')
                .set('Authorization', authorAuthHeader)
                .send({
                    gameId: testGameId,
                    roundNumber: 1,
                    images: [{ url: 'https://example.com/rollback-test.webp' }],
                })
                .expect(201);
            const postId = createRes.body.id;

            // Rollback round 1
            await request(app)
                .delete(`/api/games/${testGameId}/rounds/1`)
                .set('Authorization', authorAuthHeader)
                .expect(200);

            // Fetch the post: it survives, but roundNumber is null
            const postRes = await request(app)
                .get(`/api/posts/${postId}`)
                .expect(200);

            expect(postRes.body.id).toBe(postId);
            expect(postRes.body.gameId).toBe(testGameId);
            expect(postRes.body.roundNumber).toBeNull();
            expect(postRes.body.game).toBeDefined();
            expect(postRes.body.game.id).toBe(testGameId);
            expect(postRes.body.game.roundNumber).toBeUndefined();
        });
    });
});
