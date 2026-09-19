import { resetTestDatabase } from './testHelpers.ts';
import request from 'supertest';
import express from 'express';
import shareRoutes from '../src/routes/ShareRoutes.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import { dbManager } from '../src/db/dbInit.ts';
import config from '../config/config.ts';

const app = express();
app.use(express.json());
app.use('/share', shareRoutes);
app.use(handleErrors);

const SYSTEM_USER_ID = 0;

describe('Share OpenGraph Routes', () => {
    const VISIBLE_USER_ID = 96100;
    const HIDDEN_USER_ID = 96101;
    const ts = '2026-06-01T12:00:00.000Z';
    let visiblePostId: number;
    let hiddenPostId: number;
    let maliciousPostId: number;

    beforeAll(() => {
        dbManager.db.prepare(
            `INSERT INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
             VALUES
                (?, 'Visible Author', 'vis_author', 9610001, 0, 1, 'ACTIVE', ?, ?, ?),
                (?, 'Secret Author', 'sec_author', 9610002, 0, 1, 'ACTIVE', ?, ?, ?)`
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
                (?, 'Visible', 'Author', 'https://example.com/vis.jpg', 0, ?, ?),
                (?, 'Secret', 'Author', 'https://example.com/sec.jpg', 1, ?, ?)`
        ).run(
            VISIBLE_USER_ID,
            ts,
            SYSTEM_USER_ID,
            HIDDEN_USER_ID,
            ts,
            SYSTEM_USER_ID
        );

        // Visible post with image
        const p1 = dbManager.db.prepare(
            `INSERT INTO post (authorId, text, createdAt) VALUES (?, 'Normal post text', ?)`
        ).run(VISIBLE_USER_ID, ts);
        visiblePostId = Number(p1.lastInsertRowid);
        dbManager.db.prepare(
            `INSERT INTO post_image (postId, url, sortOrder) VALUES (?, 'https://storage.googleapis.com/img1.jpg', 0)`
        ).run(visiblePostId);

        // Hidden author post
        const p2 = dbManager.db.prepare(
            `INSERT INTO post (authorId, text, createdAt) VALUES (?, 'Secret post text', ?)`
        ).run(HIDDEN_USER_ID, ts);
        hiddenPostId = Number(p2.lastInsertRowid);

        // Malicious characters post
        const p3 = dbManager.db.prepare(
            `INSERT INTO post (authorId, text, createdAt) VALUES (?, 'Post with "quotes" & <script>alert(1)</script>', ?)`
        ).run(VISIBLE_USER_ID, ts);
        maliciousPostId = Number(p3.lastInsertRowid);

        // Unlocked achievement for visible user
        dbManager.db.prepare(
            `INSERT INTO automaticAchievementState (
                userId, code, scope, progress, target, unlockedAt, value, computedAt
            ) VALUES (?, 'GAMES_1', 'GLOBAL', 1, 1, ?, 1, ?)`
        ).run(VISIBLE_USER_ID, ts, ts);

        // Locked achievement for visible user
        dbManager.db.prepare(
            `INSERT INTO automaticAchievementState (
                userId, code, scope, progress, target, unlockedAt, value, computedAt
            ) VALUES (?, 'GAMES_10', 'GLOBAL', 5, 10, NULL, 5, ?)`
        ).run(VISIBLE_USER_ID, ts);

        // Unlocked achievement for hidden user
        dbManager.db.prepare(
            `INSERT INTO automaticAchievementState (
                userId, code, scope, progress, target, unlockedAt, value, computedAt
            ) VALUES (?, 'GAMES_1', 'GLOBAL', 1, 1, ?, 1, ?)`
        ).run(HIDDEN_USER_ID, ts, ts);
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM post_image WHERE postId IN (?, ?, ?)').run(
            visiblePostId,
            hiddenPostId,
            maliciousPostId
        );
        dbManager.db.prepare('DELETE FROM post WHERE id IN (?, ?, ?)').run(
            visiblePostId,
            hiddenPostId,
            maliciousPostId
        );
        dbManager.db.prepare('DELETE FROM automaticAchievementState WHERE userId IN (?, ?)').run(
            VISIBLE_USER_ID,
            HIDDEN_USER_ID
        );
        dbManager.db.prepare('DELETE FROM profile WHERE userId IN (?, ?)').run(VISIBLE_USER_ID, HIDDEN_USER_ID);
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?)').run(VISIBLE_USER_ID, HIDDEN_USER_ID);
        resetTestDatabase();
    });

    describe('GET /share/posts/:id', () => {
        it('renders HTML with OG tags and post preview', async () => {
            const res = await request(app)
                .get(`/share/posts/${visiblePostId}`)
                .expect(200);

            expect(res.headers['content-type']).toContain('text/html');
            expect(res.text).toContain('<meta property="og:title" content="Visible Author on Riichi Dojo">');
            expect(res.text).toContain('<meta property="og:description" content="Normal post text">');
            expect(res.text).toContain('<meta property="og:image" content="https://storage.googleapis.com/img1.jpg">');
            expect(res.text).toContain(
                `<meta property="og:url" content="${config.publicWebUrl}/posts/${visiblePostId}">`
            );
            expect(res.text).toContain('<meta name="twitter:card" content="summary_large_image">');
        });

        it('safely escapes HTML characters in quotes and angle brackets', async () => {
            const res = await request(app)
                .get(`/share/posts/${maliciousPostId}`)
                .expect(200);

            expect(res.text).not.toContain('<script>');
            expect(res.text).toContain('&quot;quotes&quot; &amp; &lt;script&gt;alert(1)&lt;/script&gt;');
        });

        it('hides author identity when post author has hideProfile set', async () => {
            const res = await request(app)
                .get(`/share/posts/${hiddenPostId}`)
                .expect(200);

            expect(res.text).toContain('<meta property="og:title" content="Post on Riichi Dojo">');
            expect(res.text).not.toContain('Secret Author');
        });

        it('returns 404 for nonexistent post', async () => {
            const res = await request(app)
                .get('/share/posts/9999999')
                .expect(404);

            expect(res.body.errorCode).toBe('postNotFound');
        });
    });

    describe('GET /share/users/:userId/achievements/:code', () => {
        it('renders HTML with achievement OG tags and absolute image URL', async () => {
            const res = await request(app)
                .get(`/share/users/${VISIBLE_USER_ID}/achievements/GAMES_1`)
                .set('Accept-Language', 'en')
                .expect(200);

            expect(res.headers['content-type']).toContain('text/html');
            expect(res.text).toContain('<meta property="og:title" content="Visible Author unlocked First Step">');
            expect(res.text).toContain(
                `<meta property="og:image" content="${config.publicWebUrl}/achievement-icons/automatic/v1/details/GAMES_1.webp">`
            );
            expect(res.text).toContain(
                `<meta property="og:url" content="${config.publicWebUrl}/users/${VISIBLE_USER_ID}/achievements/GAMES_1">`
            );
        });

        it('returns 404 when user has hideProfile set', async () => {
            const res = await request(app)
                .get(`/share/users/${HIDDEN_USER_ID}/achievements/GAMES_1`)
                .expect(404);

            expect(res.body.errorCode).toBe('userNotFoundById');
        });

        it('returns 404 when achievement is not unlocked', async () => {
            const res = await request(app)
                .get(`/share/users/${VISIBLE_USER_ID}/achievements/GAMES_10`)
                .expect(404);

            expect(res.body.errorCode).toBe('achievementNotFound');
        });
    });
});
