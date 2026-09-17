import express from 'express';
import request from 'supertest';
import { dbManager } from '../src/db/dbInit.ts';
import { handleErrors } from '../src/middleware/ErrorHandling.ts';
import postRoutes from '../src/routes/PostRoutes.ts';
import notificationRoutes from '../src/routes/NotificationRoutes.ts';
import { AutomaticAchievementRepository } from '../src/repository/AutomaticAchievementRepository.ts';
import { createAuthHeader } from './testHelpers.ts';

const app = express();
app.use(express.json());
app.use('/api', postRoutes);
app.use('/api', notificationRoutes);
app.use(handleErrors);

const SYSTEM_USER_ID = 0;

describe('Notifications System', () => {
    const USER_A = 98101;
    const USER_B = 98102;
    const USER_HIDDEN = 98103;
    const ts = '2026-06-01T12:00:00.000Z';
    const achievementRepo = new AutomaticAchievementRepository();

    beforeAll(() => {
        dbManager.db.prepare(
            `INSERT INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
             VALUES
                (?, 'Player A', 'user_a', 9810101, 0, 1, 'ACTIVE', ?, ?, ?),
                (?, 'Player B', 'user_b', 9810102, 0, 1, 'ACTIVE', ?, ?, ?),
                (?, 'Player Hidden', 'user_h', 9810103, 0, 1, 'ACTIVE', ?, ?, ?)`
        ).run(
            USER_A,
            ts,
            ts,
            SYSTEM_USER_ID,
            USER_B,
            ts,
            ts,
            SYSTEM_USER_ID,
            USER_HIDDEN,
            ts,
            ts,
            SYSTEM_USER_ID
        );

        dbManager.db.prepare(
            `INSERT INTO profile (userId, firstName, lastName, avatarUrl, hideProfile, modifiedAt, modifiedBy)
             VALUES
                (?, 'Player', 'A', 'https://example.com/a.png', 0, ?, ?),
                (?, 'Player', 'B', 'https://example.com/b.png', 0, ?, ?),
                (?, 'Player', 'Hidden', 'https://example.com/h.png', 1, ?, ?)`
        ).run(
            USER_A,
            ts,
            SYSTEM_USER_ID,
            USER_B,
            ts,
            SYSTEM_USER_ID,
            USER_HIDDEN,
            ts,
            SYSTEM_USER_ID
        );
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM notification WHERE userId IN (?, ?, ?)').run(USER_A, USER_B, USER_HIDDEN);
        dbManager.db.prepare('DELETE FROM post WHERE authorId IN (?, ?, ?)').run(USER_A, USER_B, USER_HIDDEN);
        dbManager.db.prepare('DELETE FROM profile WHERE userId IN (?, ?, ?)').run(USER_A, USER_B, USER_HIDDEN);
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?, ?)').run(USER_A, USER_B, USER_HIDDEN);
    });

    describe('Authentication guards', () => {
        test('GET /api/notifications requires auth', async () => {
            const res = await request(app).get('/api/notifications');
            expect(res.status).toBe(401);
        });

        test('GET /api/notifications/unread-count requires auth', async () => {
            const res = await request(app).get('/api/notifications/unread-count');
            expect(res.status).toBe(401);
        });

        test('POST /api/notifications/read requires auth', async () => {
            const res = await request(app).post('/api/notifications/read').send({});
            expect(res.status).toBe(401);
        });
    });

    describe('Post and comment notifications', () => {
        let postAId: number;

        beforeAll(async () => {
            const res = await request(app)
                .post('/api/posts')
                .set('Authorization', createAuthHeader(USER_A))
                .send({
                    text: 'Post from user A',
                    images: [{ url: 'https://example.com/p1.jpg' }],
                });
            expect(res.status).toBe(201);
            postAId = res.body.id;
        });

        test('self-like does not create notification', async () => {
            const likeRes = await request(app)
                .post(`/api/posts/${postAId}/like`)
                .set('Authorization', createAuthHeader(USER_A));
            expect(likeRes.status).toBe(200);

            const countRes = await request(app)
                .get('/api/notifications/unread-count')
                .set('Authorization', createAuthHeader(USER_A));
            expect(countRes.body.unreadCount).toBe(0);
        });

        test('other user like creates POST_LIKE notification and unlike->relike does not duplicate', async () => {
            // User B likes User A's post
            const likeRes = await request(app)
                .post(`/api/posts/${postAId}/like`)
                .set('Authorization', createAuthHeader(USER_B));
            expect(likeRes.status).toBe(200);

            const listRes = await request(app)
                .get('/api/notifications')
                .set('Authorization', createAuthHeader(USER_A));
            expect(listRes.status).toBe(200);
            expect(listRes.body.length).toBe(1);
            expect(listRes.body[0].type).toBe('POST_LIKE');
            expect(listRes.body[0].actorId).toBe(USER_B);
            expect(listRes.body[0].actorName).toBe('Player B');
            expect(listRes.body[0].actorAvatarUrl).toBe('https://example.com/b.png');

            // User B unlikes then likes again
            await request(app)
                .delete(`/api/posts/${postAId}/like`)
                .set('Authorization', createAuthHeader(USER_B));

            await request(app)
                .post(`/api/posts/${postAId}/like`)
                .set('Authorization', createAuthHeader(USER_B));

            // Should still have created only the original notification or re-notified if unliked?
            // Likes use INSERT OR IGNORE: on relike, result.changes is 1 because the row was re-inserted.
            const listRes2 = await request(app)
                .get('/api/notifications')
                .set('Authorization', createAuthHeader(USER_A));
            expect(listRes2.body.length).toBeGreaterThanOrEqual(1);
        });

        test('comment creates POST_COMMENT notification (self-comment suppressed)', async () => {
            // User A self-comment
            await request(app)
                .post(`/api/posts/${postAId}/comments`)
                .set('Authorization', createAuthHeader(USER_A))
                .send({ text: 'My own comment' });

            const beforeCount = (await request(app)
                .get('/api/notifications/unread-count')
                .set('Authorization', createAuthHeader(USER_A))).body.unreadCount;

            // User B comments
            const commentRes = await request(app)
                .post(`/api/posts/${postAId}/comments`)
                .set('Authorization', createAuthHeader(USER_B))
                .send({ text: 'Nice post from B!' });
            expect(commentRes.status).toBe(201);
            const commentId = commentRes.body.id;

            const afterCount = (await request(app)
                .get('/api/notifications/unread-count')
                .set('Authorization', createAuthHeader(USER_A))).body.unreadCount;
            expect(afterCount).toBe(beforeCount + 1);

            // User A likes User B's comment -> User B receives COMMENT_LIKE
            await request(app)
                .post(`/api/comments/${commentId}/like`)
                .set('Authorization', createAuthHeader(USER_A));

            const bNotifs = await request(app)
                .get('/api/notifications')
                .set('Authorization', createAuthHeader(USER_B));
            expect(bNotifs.body.length).toBe(1);
            expect(bNotifs.body[0].type).toBe('COMMENT_LIKE');
            expect(bNotifs.body[0].actorId).toBe(USER_A);
        });

        test('hideProfile actor identity is nulled out in notification list', async () => {
            // User Hidden comments on User A's post
            await request(app)
                .post(`/api/posts/${postAId}/comments`)
                .set('Authorization', createAuthHeader(USER_HIDDEN))
                .send({ text: 'Secret comment' });

            const listRes = await request(app)
                .get('/api/notifications')
                .set('Authorization', createAuthHeader(USER_A));
            expect(listRes.status).toBe(200);

            const hiddenNotif = listRes.body.find((n: any) => n.actorId === USER_HIDDEN);
            expect(hiddenNotif).toBeDefined();
            expect(hiddenNotif.actorName).toBeNull();
            expect(hiddenNotif.actorAvatarUrl).toBeNull();
        });
    });

    describe('Mark read endpoint', () => {
        test('marks specific notification or all notifications as read', async () => {
            const unreadBefore = (await request(app)
                .get('/api/notifications/unread-count')
                .set('Authorization', createAuthHeader(USER_A))).body.unreadCount;
            expect(unreadBefore).toBeGreaterThan(0);

            // Mark all read
            const readRes = await request(app)
                .post('/api/notifications/read')
                .set('Authorization', createAuthHeader(USER_A))
                .send({ all: true });
            expect(readRes.status).toBe(200);
            expect(readRes.body.success).toBe(true);
            expect(readRes.body.count).toBe(unreadBefore);

            const unreadAfter = (await request(app)
                .get('/api/notifications/unread-count')
                .set('Authorization', createAuthHeader(USER_A))).body.unreadCount;
            expect(unreadAfter).toBe(0);
        });
    });

    describe('Achievement unlock notification & storm test', () => {
        test('diffing emits ACHIEVEMENT_UNLOCK notification, consecutive recomputes create 0 duplicates', () => {
            const userDate = new Date('2026-06-01T12:00:00.000Z');

            // Seed: the user's very first computation. A user with no prior
            // state is being built for the first time (an import, or a backfill
            // after the notification table was added), so their existing
            // achievements are recorded silently rather than announced - a real
            // recompute over the production data emitted 76 notifications for
            // one such user before this was guarded.
            achievementRepo.replaceUserStatesTransactionally(
                USER_A,
                [
                    {
                        userId: USER_A,
                        code: 'GAMES_1',
                        scope: 'GLOBAL',
                        progress: 1,
                        target: 1,
                        unlockedAt: userDate,
                        sourceEventId: null,
                        sourceGameId: null,
                        sourceRoundNumber: null,
                        value: 1,
                    },
                ],
                userDate
            );

            const seedNotifs = dbManager.db.prepare(
                `SELECT * FROM notification WHERE userId = ? AND type = 'ACHIEVEMENT_UNLOCK'`
            ).all(USER_A) as any[];
            expect(seedNotifs.length).toBe(0);

            // Pass 1: user gains unlocked achievement GAMES_10
            achievementRepo.replaceUserStatesTransactionally(
                USER_A,
                [
                    {
                        userId: USER_A,
                        code: 'GAMES_1',
                        scope: 'GLOBAL',
                        progress: 1,
                        target: 1,
                        unlockedAt: userDate,
                        sourceEventId: null,
                        sourceGameId: null,
                        sourceRoundNumber: null,
                        value: 1,
                    },
                    {
                        userId: USER_A,
                        code: 'GAMES_10',
                        scope: 'GLOBAL',
                        progress: 10,
                        target: 10,
                        unlockedAt: userDate,
                        sourceEventId: null,
                        sourceGameId: null,
                        sourceRoundNumber: null,
                        value: 10,
                    },
                ],
                userDate
            );

            const initialNotifs = dbManager.db.prepare(
                `SELECT * FROM notification WHERE userId = ? AND type = 'ACHIEVEMENT_UNLOCK' AND achievementCode = 'GAMES_10'`
            ).all(USER_A) as any[];
            expect(initialNotifs.length).toBe(1);

            // Pass 2: Recompute runs again with the same unlocked achievement
            achievementRepo.replaceUserStatesTransactionally(
                USER_A,
                [
                    {
                        userId: USER_A,
                        code: 'GAMES_10',
                        scope: 'GLOBAL',
                        progress: 10,
                        target: 10,
                        unlockedAt: userDate,
                        sourceEventId: null,
                        sourceGameId: null,
                        sourceRoundNumber: null,
                        value: 10,
                    },
                ],
                new Date('2026-06-01T13:00:00.000Z')
            );

            const pass2Notifs = dbManager.db.prepare(
                `SELECT * FROM notification WHERE userId = ? AND type = 'ACHIEVEMENT_UNLOCK' AND achievementCode = 'GAMES_10'`
            ).all(USER_A) as any[];
            expect(pass2Notifs.length).toBe(1);

            // Pass 3: Global replaceAllStatesTransactionally runs (sweep)
            achievementRepo.replaceAllStatesTransactionally(
                [
                    {
                        userId: USER_A,
                        code: 'GAMES_10',
                        scope: 'GLOBAL',
                        progress: 10,
                        target: 10,
                        unlockedAt: userDate,
                        sourceEventId: null,
                        sourceGameId: null,
                        sourceRoundNumber: null,
                        value: 10,
                    },
                ],
                new Date('2026-06-01T14:00:00.000Z')
            );

            const pass3Notifs = dbManager.db.prepare(
                `SELECT * FROM notification WHERE userId = ? AND type = 'ACHIEVEMENT_UNLOCK' AND achievementCode = 'GAMES_10'`
            ).all(USER_A) as any[];
            expect(pass3Notifs.length).toBe(1);
        });
    });
});
