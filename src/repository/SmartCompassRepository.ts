import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { SmartCompassPairingCode, SmartCompassSession } from '../model/SmartCompassModels.ts';

export class SmartCompassRepository {
    private createPairingCodeStatement(): Statement<CreatePairingCodeParams, { id: number }> {
        return dbManager.db.prepare(`
            INSERT INTO smartCompassPairingCode (gameId, codeHash, expiresAt, createdAt, createdBy)
            VALUES (:gameId, :codeHash, :expiresAt, :createdAt, :createdBy)
            RETURNING id
        `);
    }

    createPairingCode(params: CreatePairingCodeParams): number {
        const result = this.createPairingCodeStatement().get(params);
        return result!.id;
    }

    private pairingCodeHashExistsStatement(): Statement<{ codeHash: string }, { found: number }> {
        return dbManager.db.prepare('SELECT 1 as found FROM smartCompassPairingCode WHERE codeHash = :codeHash');
    }

    pairingCodeHashExists(codeHash: string): boolean {
        return this.pairingCodeHashExistsStatement().get({ codeHash }) !== undefined;
    }

    private findPairingCodeByHashStatement(): Statement<{ codeHash: string }, SmartCompassPairingCodeDBEntity> {
        return dbManager.db.prepare(`
            SELECT id, gameId, codeHash, expiresAt, redeemedAt, createdAt, createdBy
            FROM smartCompassPairingCode
            WHERE codeHash = :codeHash
        `);
    }

    findPairingCodeByHash(codeHash: string): SmartCompassPairingCode | undefined {
        const dbEntity = this.findPairingCodeByHashStatement().get({ codeHash });
        return dbEntity !== undefined ? smartCompassPairingCodeFromDBEntity(dbEntity) : undefined;
    }

    private markPairingCodeRedeemedStatement(): Statement<{ id: number, redeemedAt: string }, void> {
        return dbManager.db.prepare(`
            UPDATE smartCompassPairingCode
            SET redeemedAt = :redeemedAt
            WHERE id = :id
        `);
    }

    markPairingCodeRedeemed(id: number, redeemedAt: Date): void {
        this.markPairingCodeRedeemedStatement().run({ id, redeemedAt: redeemedAt.toISOString() });
    }

    private createSessionStatement(): Statement<CreateSmartCompassSessionParams, { id: number }> {
        return dbManager.db.prepare(`
            INSERT INTO smartCompassSession (
                gameId,
                pairingCodeId,
                tokenHash,
                deviceLabel,
                expiresAt,
                lastUsedAt,
                createdAt,
                createdBy,
                modifiedAt,
                modifiedBy
            )
            VALUES (
                :gameId,
                :pairingCodeId,
                :tokenHash,
                :deviceLabel,
                :expiresAt,
                NULL,
                :createdAt,
                :createdBy,
                :modifiedAt,
                :modifiedBy
            )
            RETURNING id
        `);
    }

    createSession(params: CreateSmartCompassSessionParams): number {
        const result = this.createSessionStatement().get(params);
        return result!.id;
    }

    private findSessionByIdStatement(): Statement<{ id: number }, SmartCompassSessionDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                id,
                gameId,
                pairingCodeId,
                tokenHash,
                deviceLabel,
                expiresAt,
                revokedAt,
                lastUsedAt,
                createdAt,
                createdBy,
                modifiedAt,
                modifiedBy
            FROM smartCompassSession
            WHERE id = :id
        `);
    }

    findSessionById(id: number): SmartCompassSession | undefined {
        const dbEntity = this.findSessionByIdStatement().get({ id });
        return dbEntity !== undefined ? smartCompassSessionFromDBEntity(dbEntity) : undefined;
    }

    private findSessionByTokenHashStatement(): Statement<{ tokenHash: string }, SmartCompassSessionDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                id,
                gameId,
                pairingCodeId,
                tokenHash,
                deviceLabel,
                expiresAt,
                revokedAt,
                lastUsedAt,
                createdAt,
                createdBy,
                modifiedAt,
                modifiedBy
            FROM smartCompassSession
            WHERE tokenHash = :tokenHash
        `);
    }

    findSessionByTokenHash(tokenHash: string): SmartCompassSession | undefined {
        const dbEntity = this.findSessionByTokenHashStatement().get({ tokenHash });
        return dbEntity !== undefined ? smartCompassSessionFromDBEntity(dbEntity) : undefined;
    }

    private findSessionsByGameIdStatement(): Statement<{ gameId: number }, SmartCompassSessionDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                id,
                gameId,
                pairingCodeId,
                tokenHash,
                deviceLabel,
                expiresAt,
                revokedAt,
                lastUsedAt,
                createdAt,
                createdBy,
                modifiedAt,
                modifiedBy
            FROM smartCompassSession
            WHERE gameId = :gameId
            ORDER BY createdAt DESC, id DESC
        `);
    }

    findSessionsByGameId(gameId: number): SmartCompassSession[] {
        return this.findSessionsByGameIdStatement().all({ gameId }).map(smartCompassSessionFromDBEntity);
    }

    private revokeSessionStatement(): Statement<
        { id: number, revokedAt: string, modifiedAt: string, modifiedBy: number },
        void
    > {
        return dbManager.db.prepare(`
            UPDATE smartCompassSession
            SET revokedAt = COALESCE(revokedAt, :revokedAt),
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE id = :id
        `);
    }

    revokeSession(id: number, revokedAt: Date, modifiedBy: number): void {
        const timestamp = revokedAt.toISOString();
        this.revokeSessionStatement().run({ id, revokedAt: timestamp, modifiedAt: timestamp, modifiedBy });
    }

    private touchSessionStatement(): Statement<{ id: number, lastUsedAt: string, modifiedAt: string }, void> {
        return dbManager.db.prepare(`
            UPDATE smartCompassSession
            SET lastUsedAt = :lastUsedAt,
                modifiedAt = :modifiedAt
            WHERE id = :id
        `);
    }

    touchSession(id: number, lastUsedAt: Date): void {
        const timestamp = lastUsedAt.toISOString();
        this.touchSessionStatement().run({ id, lastUsedAt: timestamp, modifiedAt: timestamp });
    }
}

export interface CreatePairingCodeParams {
    gameId: number;
    codeHash: string;
    expiresAt: string;
    createdAt: string;
    createdBy: number;
}

export interface CreateSmartCompassSessionParams {
    gameId: number;
    pairingCodeId: number;
    tokenHash: string;
    deviceLabel: string | null;
    expiresAt: string;
    createdAt: string;
    createdBy: number;
    modifiedAt: string;
    modifiedBy: number;
}

interface SmartCompassPairingCodeDBEntity {
    id: number;
    gameId: number;
    codeHash: string;
    expiresAt: string;
    redeemedAt: string | null;
    createdAt: string;
    createdBy: number;
}

interface SmartCompassSessionDBEntity {
    id: number;
    gameId: number;
    pairingCodeId: number;
    tokenHash: string;
    deviceLabel: string | null;
    expiresAt: string;
    revokedAt: string | null;
    lastUsedAt: string | null;
    createdAt: string;
    createdBy: number;
    modifiedAt: string;
    modifiedBy: number;
}

function smartCompassPairingCodeFromDBEntity(dbEntity: SmartCompassPairingCodeDBEntity): SmartCompassPairingCode {
    return {
        id: dbEntity.id,
        gameId: dbEntity.gameId,
        codeHash: dbEntity.codeHash,
        expiresAt: new Date(dbEntity.expiresAt),
        redeemedAt: dbEntity.redeemedAt !== null ? new Date(dbEntity.redeemedAt) : null,
        createdAt: new Date(dbEntity.createdAt),
        createdBy: dbEntity.createdBy,
    };
}

function smartCompassSessionFromDBEntity(dbEntity: SmartCompassSessionDBEntity): SmartCompassSession {
    return {
        id: dbEntity.id,
        gameId: dbEntity.gameId,
        pairingCodeId: dbEntity.pairingCodeId,
        tokenHash: dbEntity.tokenHash,
        deviceLabel: dbEntity.deviceLabel,
        expiresAt: new Date(dbEntity.expiresAt),
        revokedAt: dbEntity.revokedAt !== null ? new Date(dbEntity.revokedAt) : null,
        lastUsedAt: dbEntity.lastUsedAt !== null ? new Date(dbEntity.lastUsedAt) : null,
        createdAt: new Date(dbEntity.createdAt),
        createdBy: dbEntity.createdBy,
        modifiedAt: new Date(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy,
    };
}
