import { dbManager } from '../db/dbInit.ts';
import type {
    CreateNotificationDTO,
    Notification,
    NotificationType,
} from '../model/NotificationModels.ts';

interface NotificationDBRow {
    id: number;
    userId: number;
    type: NotificationType;
    actorId: number | null;
    postId: number | null;
    commentId: number | null;
    achievementCode: string | null;
    scope: string | null;
    payload: string | null;
    readAt: string | null;
    createdAt: string;
    actorName: string | null;
    actorAvatarUrl: string | null;
}

function mapRow(row: NotificationDBRow): Notification {
    return {
        id: row.id,
        userId: row.userId,
        type: row.type,
        actorId: row.actorId,
        postId: row.postId,
        commentId: row.commentId,
        achievementCode: row.achievementCode,
        scope: row.scope,
        payload: row.payload,
        readAt: row.readAt,
        createdAt: row.createdAt,
        actorName: row.actorName,
        actorAvatarUrl: row.actorAvatarUrl,
    };
}

export class NotificationRepository {
    createNotification(dto: CreateNotificationDTO): number {
        const now = new Date().toISOString();
        const scope = dto.scope ?? (dto.type === 'ACHIEVEMENT_UNLOCK' ? 'GLOBAL' : null);
        const result = dbManager.db.prepare(`
            INSERT OR IGNORE INTO notification (
                userId, type, actorId, postId, commentId, achievementCode, scope, payload, createdAt
            ) VALUES (
                :userId, :type, :actorId, :postId, :commentId, :achievementCode, :scope, :payload, :createdAt
            )
        `).run({
            userId: dto.userId,
            type: dto.type,
            actorId: dto.actorId ?? null,
            postId: dto.postId ?? null,
            commentId: dto.commentId ?? null,
            achievementCode: dto.achievementCode ?? null,
            scope,
            payload: dto.payload ?? null,
            createdAt: now,
        });

        return Number(result.lastInsertRowid);
    }

    findNotificationsByUserId(userId: number, limit: number = 50, offset: number = 0): Notification[] {
        const rows = dbManager.db.prepare(`
            SELECT
                n.id,
                n.userId,
                n.type,
                n.actorId,
                n.postId,
                n.commentId,
                n.achievementCode,
                n.scope,
                n.payload,
                n.readAt,
                n.createdAt,
                CASE WHEN p.hideProfile = 1 THEN NULL ELSE u.name END AS actorName,
                CASE WHEN p.hideProfile = 1 THEN NULL ELSE p.avatarUrl END AS actorAvatarUrl
            FROM notification n
            LEFT JOIN user u ON u.id = n.actorId
            LEFT JOIN profile p ON p.userId = u.id
            WHERE n.userId = ?
            ORDER BY n.createdAt DESC, n.id DESC
            LIMIT ? OFFSET ?
        `).all(userId, limit, offset) as NotificationDBRow[];

        return rows.map(mapRow);
    }

    findNotificationById(id: number): Notification | null {
        const row = dbManager.db.prepare(`
            SELECT
                n.id,
                n.userId,
                n.type,
                n.actorId,
                n.postId,
                n.commentId,
                n.achievementCode,
                n.scope,
                n.payload,
                n.readAt,
                n.createdAt,
                CASE WHEN p.hideProfile = 1 THEN NULL ELSE u.name END AS actorName,
                CASE WHEN p.hideProfile = 1 THEN NULL ELSE p.avatarUrl END AS actorAvatarUrl
            FROM notification n
            LEFT JOIN user u ON u.id = n.actorId
            LEFT JOIN profile p ON p.userId = u.id
            WHERE n.id = ?
        `).get(id) as NotificationDBRow | undefined;

        return row ? mapRow(row) : null;
    }

    countUnreadByUserId(userId: number): number {
        const row = dbManager.db.prepare(`
            SELECT COUNT(*) as count
            FROM notification
            WHERE userId = ? AND readAt IS NULL
        `).get(userId) as { count: number } | undefined;

        return row?.count ?? 0;
    }

    markRead(userId: number, notificationIds?: number[]): number {
        const now = new Date().toISOString();
        if (notificationIds && notificationIds.length > 0) {
            const placeholders = notificationIds.map(() => '?').join(', ');
            const result = dbManager.db.prepare(`
                UPDATE notification
                SET readAt = ?
                WHERE userId = ? AND readAt IS NULL AND id IN (${placeholders})
            `).run(now, userId, ...notificationIds);
            return result.changes;
        }

        const result = dbManager.db.prepare(`
            UPDATE notification
            SET readAt = ?
            WHERE userId = ? AND readAt IS NULL
        `).run(now, userId);
        return result.changes;
    }

    broadcastSystemNotification(
        key: string,
        url?: string,
        options: { dryRun?: boolean } = {}
    ): { recipientCount: number, insertedCount: number } {
        const payload = JSON.stringify(url ? { key, url } : { key });
        const now = new Date().toISOString();

        const findEligibleStmt = dbManager.db.prepare(`
            SELECT u.id
            FROM user u
            WHERE u.isActive = 1
              AND u.id != 0
              AND NOT EXISTS (
                SELECT 1 FROM notification n
                WHERE n.userId = u.id
                  AND n.type = 'SYSTEM'
                  AND json_extract(n.payload, '$.key') = :key
              )
        `);

        const eligibleUsers = findEligibleStmt.all({ key }) as { id: number }[];
        const recipientCount = eligibleUsers.length;

        if (options.dryRun || recipientCount === 0) {
            return { recipientCount, insertedCount: 0 };
        }

        const insertStmt = dbManager.db.prepare(`
            INSERT INTO notification (
                userId, type, payload, createdAt
            ) VALUES (
                :userId, 'SYSTEM', :payload, :createdAt
            )
        `);

        dbManager.db.transaction(() => {
            for (const user of eligibleUsers) {
                insertStmt.run({
                    userId: user.id,
                    payload,
                    createdAt: now,
                });
            }
        })();

        return { recipientCount, insertedCount: recipientCount };
    }
}
