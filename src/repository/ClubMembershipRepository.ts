import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { ClubMembership, ClubMembershipStatus, ClubRole } from '../model/ClubModels.ts';
import { parseClubMembershipStatus, parseClubRole } from '../util/EnumUtil.ts';

const MEMBERSHIP_SELECT_COLUMNS = `
    cm.clubId,
    c.name as clubName,
    cm.userId,
    u.name as userName,
    p.avatarUrl as avatarUrl,
    cm.role,
    cm.status,
    cm.createdAt,
    cm.modifiedAt,
    cm.modifiedBy
`;

const MEMBERSHIP_FROM_JOIN = `
    FROM clubMembership cm
    JOIN club c ON cm.clubId = c.id
    JOIN user u ON cm.userId = u.id
    LEFT JOIN profile p ON p.userId = cm.userId
`;

const MEMBERSHIP_FROM_JOIN_WITH_LAST_GAME = `
    ${MEMBERSHIP_FROM_JOIN}
    LEFT JOIN (
        SELECT userId, MAX(game.createdAt) as lastGameDate
        FROM userToGame
        JOIN game ON userToGame.gameId = game.id
        GROUP BY userId
    ) lastGame ON cm.userId = lastGame.userId
`;

export class ClubMembershipRepository {
    private findMembersByClubIdStatement(): Statement<{ clubId: number }, ClubMembershipDBEntity> {
        return dbManager.db.prepare(`
            SELECT ${MEMBERSHIP_SELECT_COLUMNS}
            ${MEMBERSHIP_FROM_JOIN_WITH_LAST_GAME}
            WHERE cm.clubId = :clubId
            ORDER BY lastGame.lastGameDate DESC NULLS LAST, cm.userId`);
    }

    findMembersByClubId(clubId: number): ClubMembership[] {
        return this.findMembersByClubIdStatement().all({ clubId }).map(clubMembershipFromDBEntity);
    }

    private findMembersByClubIdAndStatusStatement(): Statement<
        { clubId: number, status: ClubMembershipStatus },
        ClubMembershipDBEntity
    > {
        return dbManager.db.prepare(`
            SELECT ${MEMBERSHIP_SELECT_COLUMNS}
            ${MEMBERSHIP_FROM_JOIN_WITH_LAST_GAME}
            WHERE cm.clubId = :clubId
              AND cm.status = :status
            ORDER BY lastGame.lastGameDate DESC NULLS LAST, cm.userId`);
    }

    findPendingMembersByClubId(clubId: number): ClubMembership[] {
        return this.findMembersByClubIdAndStatusStatement().all({ clubId, status: 'PENDING' }).map(
            clubMembershipFromDBEntity
        );
    }

    findActiveMembersByClubId(clubId: number): ClubMembership[] {
        return this.findMembersByClubIdAndStatusStatement().all({ clubId, status: 'ACTIVE' }).map(
            clubMembershipFromDBEntity
        );
    }

    private findMembershipStatement(): Statement<{ clubId: number, userId: number }, ClubMembershipDBEntity> {
        return dbManager.db.prepare(`
            SELECT ${MEMBERSHIP_SELECT_COLUMNS}
            ${MEMBERSHIP_FROM_JOIN}
            WHERE cm.clubId = :clubId
              AND cm.userId = :userId`);
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

    createMembership(params: ClubMembershipCreateParams): void {
        this.createMembershipStatement().run({
            ...params,
            createdAt: params.createdAt.toISOString(),
            modifiedAt: params.modifiedAt.toISOString(),
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
            modifiedBy,
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
            modifiedBy,
        });
    }

    private deleteMembershipStatement(): Statement<{ clubId: number, userId: number }, void> {
        return dbManager.db.prepare(`
            DELETE FROM clubMembership
            WHERE clubId = :clubId
              AND userId = :userId
        `);
    }

    deleteMembership(clubId: number, userId: number): void {
        this.deleteMembershipStatement().run({ clubId, userId });
    }

    private getUserClubRoleStatement(): Statement<
        { clubId: number, userId: number, status: ClubMembershipStatus },
        { role: string }
    > {
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
        return result !== undefined ? parseClubRole(result.role) : undefined;
    }

    private findMembershipsByUserIdAndStatusStatement(): Statement<
        { userId: number, status: ClubMembershipStatus },
        ClubMembershipDBEntity
    > {
        return dbManager.db.prepare(`
            SELECT ${MEMBERSHIP_SELECT_COLUMNS}
            ${MEMBERSHIP_FROM_JOIN}
            WHERE cm.userId = :userId
              AND cm.status = :status
        `);
    }

    findActiveMembershipsByUserId(userId: number): ClubMembership[] {
        return this.findMembershipsByUserIdAndStatusStatement().all({ userId, status: 'ACTIVE' }).map(
            clubMembershipFromDBEntity
        );
    }

    private findMembershipsByUserIdStatement(): Statement<{ userId: number }, ClubMembershipDBEntity> {
        return dbManager.db.prepare(`
            SELECT ${MEMBERSHIP_SELECT_COLUMNS}
            ${MEMBERSHIP_FROM_JOIN}
            WHERE cm.userId = :userId
        `);
    }

    findMembershipsByUserId(userId: number): ClubMembership[] {
        return this.findMembershipsByUserIdStatement().all({ userId }).map(clubMembershipFromDBEntity);
    }
}

export interface ClubMembershipCreateParams {
    clubId: number;
    userId: number;
    role: ClubRole;
    status: ClubMembershipStatus;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}

export interface ClubMembershipUpdateParams {
    clubId: number;
    userId: number;
    role: ClubRole;
    status: ClubMembershipStatus;
    modifiedAt: Date;
    modifiedBy: number;
}

interface ClubMembershipDBEntity {
    clubId: number;
    clubName: string;
    userId: number;
    userName: string;
    avatarUrl: string | null;
    role: string;
    status: string;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
}

function clubMembershipFromDBEntity(dbEntity: ClubMembershipDBEntity): ClubMembership {
    return {
        clubId: dbEntity.clubId,
        clubName: dbEntity.clubName,
        userId: dbEntity.userId,
        userName: dbEntity.userName,
        avatarUrl: dbEntity.avatarUrl,
        role: parseClubRole(dbEntity.role),
        status: parseClubMembershipStatus(dbEntity.status),
        createdAt: new Date(dbEntity.createdAt),
        modifiedAt: new Date(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy,
    };
}
