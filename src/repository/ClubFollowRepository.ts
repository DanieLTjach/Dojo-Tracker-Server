import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { Club, ClubFollow } from '../model/ClubModels.ts';

export class ClubFollowRepository {
    private createFollowStatement(): Statement<{
        clubId: number;
        userId: number;
        createdAt: string;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO clubFollow (clubId, userId, createdAt, modifiedAt, modifiedBy)
            VALUES (:clubId, :userId, :createdAt, :modifiedAt, :modifiedBy)
            ON CONFLICT(clubId, userId) DO NOTHING
        `);
    }

    createFollow(params: ClubFollowCreateParams): void {
        const now = new Date().toISOString();
        this.createFollowStatement().run({
            clubId: params.clubId,
            userId: params.userId,
            createdAt: now,
            modifiedAt: now,
            modifiedBy: params.modifiedBy
        });
    }

    private deleteFollowStatement(): Statement<{ clubId: number; userId: number }, void> {
        return dbManager.db.prepare(`
            DELETE FROM clubFollow
            WHERE clubId = :clubId
              AND userId = :userId
        `);
    }

    deleteFollow(clubId: number, userId: number): void {
        this.deleteFollowStatement().run({ clubId, userId });
    }

    private findFollowStatement(): Statement<{ clubId: number; userId: number }, ClubFollowDBEntity> {
        return dbManager.db.prepare(`
            SELECT clubId, userId, createdAt, modifiedAt, modifiedBy
            FROM clubFollow
            WHERE clubId = :clubId
              AND userId = :userId
        `);
    }

    findFollow(clubId: number, userId: number): ClubFollow | undefined {
        const dbEntity = this.findFollowStatement().get({ clubId, userId });
        return dbEntity !== undefined ? clubFollowFromDBEntity(dbEntity) : undefined;
    }

    private findFollowedClubsByUserIdStatement(): Statement<{ userId: number }, ClubDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                c.id,
                c.name,
                c.address,
                c.city,
                c.description,
                c.contactInfo,
                c.isActive,
                c.currentRatingEventId,
                c.createdAt,
                c.modifiedAt,
                c.modifiedBy
            FROM clubFollow cf
            JOIN club c ON cf.clubId = c.id
            WHERE cf.userId = :userId
              AND c.isActive = 1
            ORDER BY c.id ASC
        `);
    }

    findFollowedClubsByUserId(userId: number): Club[] {
        return this.findFollowedClubsByUserIdStatement().all({ userId }).map(clubFromDBEntity);
    }
}

export interface ClubFollowCreateParams {
    clubId: number;
    userId: number;
    modifiedBy: number;
}

interface ClubFollowDBEntity {
    clubId: number;
    userId: number;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
}

interface ClubDBEntity {
    id: number;
    name: string;
    address: string | null;
    city: string | null;
    description: string | null;
    contactInfo: string | null;
    isActive: number;
    currentRatingEventId: number | null;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
}

function clubFollowFromDBEntity(dbEntity: ClubFollowDBEntity): ClubFollow {
    return {
        clubId: dbEntity.clubId,
        userId: dbEntity.userId,
        createdAt: new Date(dbEntity.createdAt),
        modifiedAt: new Date(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy
    };
}

function clubFromDBEntity(dbEntity: ClubDBEntity): Club {
    return {
        id: dbEntity.id,
        name: dbEntity.name,
        address: dbEntity.address,
        city: dbEntity.city,
        description: dbEntity.description,
        contactInfo: dbEntity.contactInfo,
        isActive: Boolean(dbEntity.isActive),
        currentRatingEventId: dbEntity.currentRatingEventId,
        createdAt: new Date(dbEntity.createdAt),
        modifiedAt: new Date(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy
    };
}
