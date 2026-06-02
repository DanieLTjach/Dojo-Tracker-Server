import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { ClubInvite, ClubInviteSource, ClubInviteType } from '../model/ClubModels.ts';
import { booleanToInteger } from '../db/dbUtils.ts';
import { parseClubInviteSource, parseClubInviteType } from '../util/EnumUtil.ts';

export class ClubInviteRepository {
    private inviteSelect = `
        SELECT
            ci.id,
            ci.clubId,
            c.name as clubName,
            ci.code,
            ci.type,
            ci.source,
            ci.label,
            ci.maxUses,
            ci.usesCount,
            ci.expiresAt,
            ci.isActive,
            ci.createdAt,
            ci.modifiedAt,
            ci.modifiedBy
        FROM clubInvite ci
        JOIN club c ON ci.clubId = c.id
    `;

    private createInviteStatement(): Statement<{
        clubId: number;
        code: string;
        type: ClubInviteType;
        source: ClubInviteSource;
        label: string | null;
        maxUses: number | null;
        expiresAt: string | null;
        isActive: number;
        createdAt: string;
        modifiedAt: string;
        modifiedBy: number;
    }, { id: number }> {
        return dbManager.db.prepare(`
            INSERT INTO clubInvite (clubId, code, type, source, label, maxUses, expiresAt, isActive, createdAt, modifiedAt, modifiedBy)
            VALUES (:clubId, :code, :type, :source, :label, :maxUses, :expiresAt, :isActive, :createdAt, :modifiedAt, :modifiedBy)
            RETURNING id
        `);
    }

    createInvite(params: ClubInviteCreateParams): number {
        const result = this.createInviteStatement().get({
            clubId: params.clubId,
            code: params.code,
            type: params.type,
            source: params.source,
            label: params.label,
            maxUses: params.maxUses,
            expiresAt: params.expiresAt !== null ? params.expiresAt.toISOString() : null,
            isActive: booleanToInteger(params.isActive),
            createdAt: params.createdAt.toISOString(),
            modifiedAt: params.modifiedAt.toISOString(),
            modifiedBy: params.modifiedBy
        });
        return result!.id;
    }

    private findByIdStatement(): Statement<{ id: number }, ClubInviteDBEntity> {
        return dbManager.db.prepare(`${this.inviteSelect} WHERE ci.id = :id`);
    }

    findById(id: number): ClubInvite | undefined {
        const dbEntity = this.findByIdStatement().get({ id });
        return dbEntity !== undefined ? clubInviteFromDBEntity(dbEntity) : undefined;
    }

    private findByCodeStatement(): Statement<{ code: string }, ClubInviteDBEntity> {
        return dbManager.db.prepare(`${this.inviteSelect} WHERE ci.code = :code`);
    }

    findByCode(code: string): ClubInvite | undefined {
        const dbEntity = this.findByCodeStatement().get({ code });
        return dbEntity !== undefined ? clubInviteFromDBEntity(dbEntity) : undefined;
    }

    private findByClubIdStatement(): Statement<{ clubId: number }, ClubInviteDBEntity> {
        return dbManager.db.prepare(`${this.inviteSelect} WHERE ci.clubId = :clubId ORDER BY ci.createdAt DESC`);
    }

    findByClubId(clubId: number): ClubInvite[] {
        return this.findByClubIdStatement().all({ clubId }).map(clubInviteFromDBEntity);
    }

    private existsByCodeStatement(): Statement<{ code: string }, { found: number }> {
        return dbManager.db.prepare(`SELECT 1 as found FROM clubInvite WHERE code = :code`);
    }

    existsByCode(code: string): boolean {
        return this.existsByCodeStatement().get({ code }) !== undefined;
    }

    private setActiveStatement(): Statement<{ id: number; isActive: number; modifiedAt: string; modifiedBy: number }, void> {
        return dbManager.db.prepare(`
            UPDATE clubInvite
            SET isActive = :isActive,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE id = :id
        `);
    }

    setActive(id: number, isActive: boolean, modifiedBy: number): void {
        this.setActiveStatement().run({
            id,
            isActive: booleanToInteger(isActive),
            modifiedAt: new Date().toISOString(),
            modifiedBy
        });
    }

    private incrementUsesStatement(): Statement<{ id: number; modifiedAt: string }, void> {
        return dbManager.db.prepare(`
            UPDATE clubInvite
            SET usesCount = usesCount + 1,
                modifiedAt = :modifiedAt
            WHERE id = :id
        `);
    }

    incrementUses(id: number): void {
        this.incrementUsesStatement().run({ id, modifiedAt: new Date().toISOString() });
    }

    private recordRedemptionStatement(): Statement<{ inviteId: number; userId: number; redeemedAt: string }, void> {
        return dbManager.db.prepare(`
            INSERT INTO clubInviteRedemption (inviteId, userId, redeemedAt)
            VALUES (:inviteId, :userId, :redeemedAt)
        `);
    }

    recordRedemption(inviteId: number, userId: number, redeemedAt: Date): void {
        this.recordRedemptionStatement().run({ inviteId, userId, redeemedAt: redeemedAt.toISOString() });
    }

    private findRedemptionStatement(): Statement<{ inviteId: number; userId: number }, { redeemedAt: string }> {
        return dbManager.db.prepare(`
            SELECT redeemedAt
            FROM clubInviteRedemption
            WHERE inviteId = :inviteId
              AND userId = :userId
        `);
    }

    findRedemption(inviteId: number, userId: number): boolean {
        return this.findRedemptionStatement().get({ inviteId, userId }) !== undefined;
    }
}

export interface ClubInviteCreateParams {
    clubId: number;
    code: string;
    type: ClubInviteType;
    source: ClubInviteSource;
    label: string | null;
    maxUses: number | null;
    expiresAt: Date | null;
    isActive: boolean;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}

interface ClubInviteDBEntity {
    id: number;
    clubId: number;
    clubName: string;
    code: string;
    type: string;
    source: string;
    label: string | null;
    maxUses: number | null;
    usesCount: number;
    expiresAt: string | null;
    isActive: number;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
}

function clubInviteFromDBEntity(dbEntity: ClubInviteDBEntity): ClubInvite {
    return {
        id: dbEntity.id,
        clubId: dbEntity.clubId,
        clubName: dbEntity.clubName,
        code: dbEntity.code,
        type: parseClubInviteType(dbEntity.type),
        source: parseClubInviteSource(dbEntity.source),
        label: dbEntity.label,
        maxUses: dbEntity.maxUses,
        usesCount: dbEntity.usesCount,
        expiresAt: dbEntity.expiresAt !== null ? new Date(dbEntity.expiresAt) : null,
        isActive: Boolean(dbEntity.isActive),
        createdAt: new Date(dbEntity.createdAt),
        modifiedAt: new Date(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy
    };
}
