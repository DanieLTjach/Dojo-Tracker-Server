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

    insert(userId: number, tokenHash: string, familyId: string, expiresAt: Date, createdAt: Date = new Date()): number {
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

    private findByHashStatement(): Statement<{ tokenHash: string }, RefreshTokenDBEntity> {
        return dbManager.db.prepare('SELECT * FROM refreshToken WHERE tokenHash = :tokenHash');
    }

    findByHash(tokenHash: string): RefreshTokenRow | undefined {
        const dbEntity = this.findByHashStatement().get({ tokenHash });
        return dbEntity !== undefined ? refreshTokenFromDBEntity(dbEntity) : undefined;
    }

    private markRotatedStatement(): Statement<{ id: number, rotatedAt: string }, void> {
        return dbManager.db.prepare(`
            UPDATE refreshToken
            SET rotatedAt = :rotatedAt
            WHERE id = :id`);
    }

    markRotated(id: number, rotatedAt: Date = new Date()): void {
        this.markRotatedStatement().run({ id, rotatedAt: rotatedAt.toISOString() });
    }

    private revokeFamilyStatement(): Statement<{ familyId: string, revokedAt: string }, void> {
        return dbManager.db.prepare(`
            UPDATE refreshToken
            SET revokedAt = :revokedAt
            WHERE familyId = :familyId AND revokedAt IS NULL`);
    }

    revokeFamily(familyId: string, revokedAt: Date = new Date()): void {
        this.revokeFamilyStatement().run({ familyId, revokedAt: revokedAt.toISOString() });
    }

    private deleteExpiredStatement(): Statement<{ now: string }, void> {
        return dbManager.db.prepare('DELETE FROM refreshToken WHERE expiresAt < :now');
    }

    deleteExpired(now: Date = new Date()): void {
        this.deleteExpiredStatement().run({ now: now.toISOString() });
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

function refreshTokenFromDBEntity(dbEntity: RefreshTokenDBEntity): RefreshTokenRow {
    return {
        id: dbEntity.id,
        userId: dbEntity.userId,
        tokenHash: dbEntity.tokenHash,
        familyId: dbEntity.familyId,
        expiresAt: new Date(dbEntity.expiresAt),
        createdAt: new Date(dbEntity.createdAt),
        rotatedAt: dbEntity.rotatedAt !== null ? new Date(dbEntity.rotatedAt) : null,
        revokedAt: dbEntity.revokedAt !== null ? new Date(dbEntity.revokedAt) : null,
    };
}
