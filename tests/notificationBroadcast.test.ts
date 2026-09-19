import { dbManager } from '../src/db/dbInit.ts';
import { NotificationRepository } from '../src/repository/NotificationRepository.ts';

describe('NotificationRepository - broadcastSystemNotification', () => {
    const repo = new NotificationRepository();
    const USER_1 = 98201;
    const USER_2 = 98202;
    const USER_INACTIVE = 98203;
    const ts = '2026-06-01T12:00:00.000Z';

    beforeAll(() => {
        dbManager.db.prepare(
            `INSERT OR IGNORE INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
             VALUES
                (?, 'Broad Player 1', 'broad_1', 9820101, 0, 1, 'ACTIVE', ?, ?, 0),
                (?, 'Broad Player 2', 'broad_2', 9820102, 0, 1, 'ACTIVE', ?, ?, 0),
                (?, 'Broad Inactive', 'broad_in', 9820103, 0, 0, 'INACTIVE', ?, ?, 0)`
        ).run(
            USER_1,
            ts,
            ts,
            USER_2,
            ts,
            ts,
            USER_INACTIVE,
            ts,
            ts
        );
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM notification WHERE userId IN (?, ?, ?)').run(USER_1, USER_2, USER_INACTIVE);
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?, ?)').run(USER_1, USER_2, USER_INACTIVE);
    });

    it('reports count without writing when dryRun is true', () => {
        const testKey = 'test_broadcast_dry_run_' + Date.now();
        const res = repo.broadcastSystemNotification(testKey, '/test-url', { dryRun: true });

        expect(res.recipientCount).toBeGreaterThanOrEqual(2);
        expect(res.insertedCount).toBe(0);

        const rows = dbManager.db.prepare(`
            SELECT id FROM notification WHERE json_extract(payload, '$.key') = ?
        `).all(testKey);
        expect(rows.length).toBe(0);
    });

    it('broadcasts to all active users and excludes inactive users and system user', () => {
        const testKey = 'test_broadcast_real_' + Date.now();
        const res = repo.broadcastSystemNotification(testKey, '/info');

        expect(res.recipientCount).toBeGreaterThanOrEqual(2);
        expect(res.insertedCount).toBe(res.recipientCount);

        const rows = dbManager.db.prepare(`
            SELECT userId, type, payload FROM notification WHERE json_extract(payload, '$.key') = ?
        `).all(testKey) as { userId: number, type: string, payload: string }[];

        const userIds = rows.map(r => r.userId);
        expect(userIds).toContain(USER_1);
        expect(userIds).toContain(USER_2);
        expect(userIds).not.toContain(USER_INACTIVE);
        expect(userIds).not.toContain(0);

        const parsed = JSON.parse(rows[0].payload);
        expect(parsed.key).toBe(testKey);
        expect(parsed.url).toBe('/info');
        expect(rows[0].type).toBe('SYSTEM');
    });

    it('is idempotent: running twice with the same key inserts 0 on the second run', () => {
        const testKey = 'test_broadcast_idempotent_' + Date.now();
        const firstRun = repo.broadcastSystemNotification(testKey, '/info');
        expect(firstRun.insertedCount).toBeGreaterThanOrEqual(2);

        const secondRun = repo.broadcastSystemNotification(testKey, '/info');
        expect(secondRun.recipientCount).toBe(0);
        expect(secondRun.insertedCount).toBe(0);
    });
});
