import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { RefreshTokenRow } from '../model/AuthModels.ts';

export class RefreshTokenRepository {
    private insertStatement(): Statement<{
        userId: number;
        tokenHash: string;
        familyId: string;
        expiresAt: string;
        createdAt: string;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO refreshToken (userId, tokenHash, familyId, expiresAt, createdAt)
            VALUES (:userId, :tokenHash, :familyId, :expiresAt, :createdAt)`);
    }

    insert(userId: number, tokenHash: string, familyId: string, expiresAt: Date, createdAt = new Date()): number {
        return Number(
            this.insertStatement().run({
                userId,
                tokenHash,
                familyId,
                expiresAt: expiresAt.toISOString(),
                createdAt: createdAt.toISOString(),
            }).lastInsertRowid
        );
    }

    findByHash(tokenHash: string): RefreshTokenRow | undefined {
        const row = dbManager.db.prepare('SELECT * FROM refreshToken WHERE tokenHash = :tokenHash')
            .get({ tokenHash }) as RefreshTokenDBEntity | undefined;
        return row === undefined ? undefined : refreshTokenFromDBEntity(row);
    }

    markRotated(id: number, rotatedAt = new Date()): void {
        dbManager.db.prepare(`UPDATE refreshToken SET rotatedAt = :rotatedAt WHERE id = :id`)
            .run({ id, rotatedAt: rotatedAt.toISOString() });
    }

    revokeFamily(familyId: string, revokedAt = new Date()): void {
        dbManager.db.prepare(`
            UPDATE refreshToken SET revokedAt = :revokedAt
            WHERE familyId = :familyId AND revokedAt IS NULL`)
            .run({ familyId, revokedAt: revokedAt.toISOString() });
    }

    deleteExpired(now = new Date()): void {
        dbManager.db.prepare('DELETE FROM refreshToken WHERE expiresAt < :now')
            .run({ now: now.toISOString() });
    }
}

interface RefreshTokenDBEntity {
    id: number;
    userId: number;
    tokenHash: string;
    familyId: string;
    expiresAt: string;
    createdAt: string;
    rotatedAt: string | null;
    revokedAt: string | null;
}

function refreshTokenFromDBEntity(row: RefreshTokenDBEntity): RefreshTokenRow {
    return {
        ...row,
        expiresAt: new Date(row.expiresAt),
        createdAt: new Date(row.createdAt),
        rotatedAt: row.rotatedAt === null ? null : new Date(row.rotatedAt),
        revokedAt: row.revokedAt === null ? null : new Date(row.revokedAt),
    };
}
