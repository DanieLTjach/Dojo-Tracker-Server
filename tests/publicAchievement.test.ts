import { resetTestDatabase } from './testHelpers.ts';
import request from 'supertest';
import express from 'express';
import publicRoutes from '../src/routes/PublicRoutes.ts';
import postRoutes from '../src/routes/PostRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';

const app = express();
app.use(express.json());
app.use('/api/public', publicRoutes);
app.use('/api', postRoutes);
app.use(handleErrors);

const SYSTEM_USER_ID = 0;

describe('Public Achievement Endpoint and Privacy Controls', () => {
    const VISIBLE_USER_ID = 97100;
    const HIDDEN_USER_ID = 97101;
    const ts = '2026-06-01T12:00:00.000Z';

    beforeAll(() => {
        // Create visible user and hidden user
        dbManager.db.prepare(
            `INSERT INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
             VALUES
                (?, 'Visible Player', 'visible_p', 9710001, 0, 1, 'ACTIVE', ?, ?, ?),
                (?, 'Hidden Player', 'hidden_p', 9710002, 0, 1, 'ACTIVE', ?, ?, ?)`
        ).run(
            VISIBLE_USER_ID,
            ts,
            ts,
            SYSTEM_USER_ID,
            HIDDEN_USER_ID,
            ts,
            ts,
            SYSTEM_USER_ID
        );

        dbManager.db.prepare(
            `INSERT INTO profile (userId, firstName, lastName, avatarUrl, hideProfile, modifiedAt, modifiedBy)
             VALUES
                (?, 'Visible', 'Player', 'https://example.com/avatar.png', 0, ?, ?),
                (?, 'Hidden', 'Player', 'https://example.com/secret.png', 1, ?, ?)`
        ).run(
            VISIBLE_USER_ID,
            ts,
            SYSTEM_USER_ID,
            HIDDEN_USER_ID,
            ts,
            SYSTEM_USER_ID
        );

        // Insert unlocked achievement for visible user
        dbManager.db.prepare(
            `INSERT INTO automaticAchievementState (
                userId, code, scope, progress, target, unlockedAt, value, computedAt
            ) VALUES (?, 'GAMES_1', 'GLOBAL', 1, 1, ?, 1, ?)`
        ).run(VISIBLE_USER_ID, ts, ts);

        // Insert locked (in-progress) achievement for visible user
        dbManager.db.prepare(
            `INSERT INTO automaticAchievementState (
                userId, code, scope, progress, target, unlockedAt, value, computedAt
            ) VALUES (?, 'GAMES_10', 'GLOBAL', 5, 10, NULL, 5, ?)`
        ).run(VISIBLE_USER_ID, ts);

        // Insert unlocked achievement for hidden user
        dbManager.db.prepare(
            `INSERT INTO automaticAchievementState (
                userId, code, scope, progress, target, unlockedAt, value, computedAt
            ) VALUES (?, 'GAMES_1', 'GLOBAL', 1, 1, ?, 1, ?)`
        ).run(HIDDEN_USER_ID, ts, ts);
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM automaticAchievementState WHERE userId IN (?, ?)').run(
            VISIBLE_USER_ID,
            HIDDEN_USER_ID
        );
        dbManager.db.prepare('DELETE FROM profile WHERE userId IN (?, ?)').run(VISIBLE_USER_ID, HIDDEN_USER_ID);
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?)').run(VISIBLE_USER_ID, HIDDEN_USER_ID);
        resetTestDatabase();
    });

    it('returns public achievement details and user info without authentication', async () => {
        const res = await request(app)
            .get(`/api/public/users/${VISIBLE_USER_ID}/achievements/GAMES_1`)
            .set('Accept-Language', 'en')
            .expect(200);

        expect(res.body).toMatchObject({
            achievement: {
                code: 'GAMES_1',
                name: 'First Step',
                category: 'CAREER',
                imageUrl: '/achievement-icons/automatic/v1/details/GAMES_1.webp',
            },
            user: {
                id: VISIBLE_USER_ID,
                name: 'Visible Player',
                avatarUrl: 'https://example.com/avatar.png',
            },
        });
        expect(res.body.achievement.awardedAt).toBeTruthy();
    });

    it('localizes achievement name and description based on request header', async () => {
        const res = await request(app)
            .get(`/api/public/users/${VISIBLE_USER_ID}/achievements/GAMES_1`)
            .set('Accept-Language', 'uk')
            .expect(200);

        expect(res.body.achievement.name).toBe('Перший крок');
    });

    it('returns 404 when achievement is not unlocked', async () => {
        const res = await request(app)
            .get(`/api/public/users/${VISIBLE_USER_ID}/achievements/GAMES_10`)
            .expect(404);

        expect(res.body.errorCode).toBe('achievementNotFound');
    });

    it('returns 404 when user has hideProfile set', async () => {
        const res = await request(app)
            .get(`/api/public/users/${HIDDEN_USER_ID}/achievements/GAMES_1`)
            .expect(404);

        expect(res.body.errorCode).toBe('userNotFoundById');
    });

    it('returns 404 when user does not exist', async () => {
        const res = await request(app)
            .get('/api/public/users/99999999/achievements/GAMES_1')
            .expect(404);

        expect(res.body.errorCode).toBe('userNotFoundById');
    });

    it('nulls author name and avatar in post reads when post author has hideProfile set', async () => {
        // Insert post by hidden user
        const postInsert = dbManager.db.prepare(
            `INSERT INTO post (authorId, text, createdAt)
             VALUES (?, 'Secret post text', ?)`
        ).run(HIDDEN_USER_ID, ts);
        const postId = Number(postInsert.lastInsertRowid);

        const res = await request(app)
            .get(`/api/posts/${postId}`)
            .expect(200);

        expect(res.body.id).toBe(postId);
        expect(res.body.text).toBe('Secret post text');
        expect(res.body.author.id).toBe(HIDDEN_USER_ID);
        expect(res.body.author.name).toBeNull();
        expect(res.body.author.avatarUrl).toBeNull();

        // Cleanup
        dbManager.db.prepare('DELETE FROM post WHERE id = ?').run(postId);
    });

    it('nulls comment author name and avatar when comment author has hideProfile set', async () => {
        // Insert post by visible user
        const postInsert = dbManager.db.prepare(
            `INSERT INTO post (authorId, text, createdAt)
             VALUES (?, 'Visible post', ?)`
        ).run(VISIBLE_USER_ID, ts);
        const postId = Number(postInsert.lastInsertRowid);

        // Insert comment by hidden user
        const commentInsert = dbManager.db.prepare(
            `INSERT INTO post_comment (postId, authorId, text, createdAt)
             VALUES (?, ?, 'Anonymous comment', ?)`
        ).run(postId, HIDDEN_USER_ID, ts);
        const commentId = Number(commentInsert.lastInsertRowid);

        const res = await request(app)
            .get(`/api/posts/${postId}/comments`)
            .expect(200);

        expect(res.body).toHaveLength(1);
        expect(res.body[0].id).toBe(commentId);
        expect(res.body[0].text).toBe('Anonymous comment');
        expect(res.body[0].author.id).toBe(HIDDEN_USER_ID);
        expect(res.body[0].author.name).toBeNull();
        expect(res.body[0].author.avatarUrl).toBeNull();

        // Cleanup
        dbManager.db.prepare('DELETE FROM post_comment WHERE id = ?').run(commentId);
        dbManager.db.prepare('DELETE FROM post WHERE id = ?').run(postId);
    });
});
