import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { ClubMembership, ClubMembershipStatus, ClubRole } from '../model/ClubModels.ts';

export class MembershipRepository {
    private findMembersByClubIdStatement(): Statement<{ clubId: number }, ClubMembershipDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                clubId,
                userId,
                role,
                status,
                createdAt,
                modifiedAt,
                modifiedBy
            FROM clubMembership
            WHERE clubId = :clubId
            ORDER BY createdAt ASC`
        );
    }

    findMembersByClubId(clubId: number): ClubMembership[] {
        return this.findMembersByClubIdStatement().all({ clubId }).map(clubMembershipFromDBEntity);
    }

    private findPendingMembersByClubIdStatement(): Statement<{ clubId: number; status: ClubMembershipStatus }, ClubMembershipDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                clubId,
                userId,
                role,
                status,
                createdAt,
                modifiedAt,
                modifiedBy
            FROM clubMembership
            WHERE clubId = :clubId
              AND status = :status
            ORDER BY createdAt ASC`
        );
    }

    findPendingMembersByClubId(clubId: number): ClubMembership[] {
        return this.findPendingMembersByClubIdStatement().all({ clubId, status: 'PENDING' }).map(clubMembershipFromDBEntity);
    }

    private findMembershipStatement(): Statement<{ clubId: number; userId: number }, ClubMembershipDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                clubId,
                userId,
                role,
                status,
                createdAt,
                modifiedAt,
                modifiedBy
            FROM clubMembership
            WHERE clubId = :clubId
              AND userId = :userId`
        );
    }

    findMembership(clubId: number, userId: number): ClubMembership | undefined {
        const dbEntity = this.findMembershipStatement().get({ clubId, userId });
        return dbEntity !== undefined ? clubMembershipFromDBEntity(dbEntity) : undefined;
    }

    private createMembershipStatement(): Statement<{
        clubId: number;
        userId: number;
        role: ClubRole;
        status: ClubMembershipStatus;
        createdAt: string;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
            VALUES (:clubId, :userId, :role, :status, :createdAt, :modifiedAt, :modifiedBy)
        `);
    }

    createMembership(params: MembershipCreateParams): void {
        this.createMembershipStatement().run({
            ...params,
            createdAt: params.createdAt.toISOString(),
            modifiedAt: params.modifiedAt.toISOString()
        });
    }

    private updateMembershipRoleStatement(): Statement<{
        clubId: number;
        userId: number;
        role: ClubRole;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            UPDATE clubMembership
            SET role = :role,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE clubId = :clubId
              AND userId = :userId
        `);
    }

    updateMembershipRole(clubId: number, userId: number, role: ClubRole, modifiedBy: number): void {
        this.updateMembershipRoleStatement().run({
            clubId,
            userId,
            role,
            modifiedAt: new Date().toISOString(),
            modifiedBy
        });
    }

    private updateMembershipStatusStatement(): Statement<{
        clubId: number;
        userId: number;
        status: ClubMembershipStatus;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            UPDATE clubMembership
            SET status = :status,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE clubId = :clubId
              AND userId = :userId
        `);
    }

    updateMembershipStatus(clubId: number, userId: number, status: ClubMembershipStatus, modifiedBy: number): void {
        this.updateMembershipStatusStatement().run({
            clubId,
            userId,
            status,
            modifiedAt: new Date().toISOString(),
            modifiedBy
        });
    }

    private deleteMembershipStatement(): Statement<{ clubId: number; userId: number }, void> {
        return dbManager.db.prepare(`
            DELETE FROM clubMembership
            WHERE clubId = :clubId
              AND userId = :userId
        `);
    }

    deleteMembership(clubId: number, userId: number): void {
        this.deleteMembershipStatement().run({ clubId, userId });
    }

    private getUserClubRoleStatement(): Statement<{ clubId: number; userId: number; status: ClubMembershipStatus }, { role: ClubRole }> {
        return dbManager.db.prepare(`
            SELECT role
            FROM clubMembership
            WHERE clubId = :clubId
              AND userId = :userId
              AND status = :status
        `);
    }

    getUserClubRole(clubId: number, userId: number): ClubRole | undefined {
        const result = this.getUserClubRoleStatement().get({ clubId, userId, status: 'ACTIVE' });
        return result?.role;
    }
}

export interface MembershipCreateParams {
    clubId: number;
    userId: number;
    role: ClubRole;
    status: ClubMembershipStatus;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}

export interface MembershipUpdateParams {
    clubId: number;
    userId: number;
    role: ClubRole;
    status: ClubMembershipStatus;
    modifiedAt: Date;
    modifiedBy: number;
}

interface ClubMembershipDBEntity {
    clubId: number;
    userId: number;
    role: ClubRole;
    status: ClubMembershipStatus;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
}

function clubMembershipFromDBEntity(dbEntity: ClubMembershipDBEntity): ClubMembership {
    return {
        clubId: dbEntity.clubId,
        userId: dbEntity.userId,
        role: dbEntity.role,
        status: dbEntity.status,
        createdAt: new Date(dbEntity.createdAt),
        modifiedAt: new Date(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy
    };
}
