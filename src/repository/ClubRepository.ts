import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import { booleanToInteger } from '../db/dbUtils.ts';
import type { Club } from '../model/ClubModels.ts';

export class ClubRepository {
    private findAllClubsStatement(): Statement<[], ClubDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                id,
                name,
                address,
                city,
                description,
                contactInfo,
                isActive,
                ratingChatId,
                ratingTopicId,
                createdAt,
                modifiedAt,
                modifiedBy
            FROM club
            ORDER BY id ASC`
        );
    }

    findAllClubs(): Club[] {
        return this.findAllClubsStatement().all().map(clubFromDBEntity);
    }

    private findClubByIdStatement(): Statement<{ id: number }, ClubDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                id,
                name,
                address,
                city,
                description,
                contactInfo,
                isActive,
                ratingChatId,
                ratingTopicId,
                createdAt,
                modifiedAt,
                modifiedBy
            FROM club
            WHERE id = :id`
        );
    }

    findClubById(id: number): Club | undefined {
        const dbEntity = this.findClubByIdStatement().get({ id });
        return dbEntity !== undefined ? clubFromDBEntity(dbEntity) : undefined;
    }

    private findClubByNameStatement(): Statement<{ name: string }, ClubDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                id,
                name,
                address,
                city,
                description,
                contactInfo,
                isActive,
                ratingChatId,
                ratingTopicId,
                createdAt,
                modifiedAt,
                modifiedBy
            FROM club
            WHERE name = :name`
        );
    }

    findClubByName(name: string): Club | undefined {
        const dbEntity = this.findClubByNameStatement().get({ name });
        return dbEntity !== undefined ? clubFromDBEntity(dbEntity) : undefined;
    }

    private createClubStatement(): Statement<{
        name: string;
        address: string | null;
        city: string | null;
        description: string | null;
        contactInfo: string | null;
        isActive: number;
        ratingChatId: string | null;
        ratingTopicId: string | null;
        createdAt: string;
        modifiedAt: string;
        modifiedBy: number;
    }, { id: number }> {
        return dbManager.db.prepare(`
            INSERT INTO club (name, address, city, description, contactInfo, isActive, ratingChatId, ratingTopicId, createdAt, modifiedAt, modifiedBy)
            VALUES (:name, :address, :city, :description, :contactInfo, :isActive, :ratingChatId, :ratingTopicId, :createdAt, :modifiedAt, :modifiedBy)
            RETURNING id
        `);
    }

    createClub(params: ClubCreateParams): number {
        const result = this.createClubStatement().get({
            ...params,
            isActive: booleanToInteger(params.isActive),
            createdAt: params.createdAt.toISOString(),
            modifiedAt: params.createdAt.toISOString()
        });

        return result!.id;
    }

    private updateClubStatement(): Statement<{
        id: number;
        name: string;
        address: string | null;
        city: string | null;
        description: string | null;
        contactInfo: string | null;
        isActive: number;
        ratingChatId: string | null;
        ratingTopicId: string | null;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            UPDATE club
            SET name = :name,
                address = :address,
                city = :city,
                description = :description,
                contactInfo = :contactInfo,
                isActive = :isActive,
                ratingChatId = :ratingChatId,
                ratingTopicId = :ratingTopicId,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE id = :id
        `);
    }

    updateClub(params: ClubUpdateParams): void {
        this.updateClubStatement().run({
            ...params,
            isActive: booleanToInteger(params.isActive),
            modifiedAt: params.modifiedAt.toISOString()
        });
    }

    private deleteClubStatement(): Statement<{ id: number }, void> {
        return dbManager.db.prepare(`
            DELETE FROM club
            WHERE id = :id
        `);
    }

    deleteClub(id: number): void {
        this.deleteClubStatement().run({ id });
    }

    private clubExistsStatement(): Statement<{ id: number }, { found: number }> {
        return dbManager.db.prepare(`
            SELECT 1 as found
            FROM club
            WHERE id = :id
        `);
    }

    clubExists(id: number): boolean {
        const result = this.clubExistsStatement().get({ id });
        return result !== undefined;
    }
}

export interface ClubCreateParams {
    name: string;
    address: string | null;
    city: string | null;
    description: string | null;
    contactInfo: string | null;
    isActive: boolean;
    ratingChatId: string | null;
    ratingTopicId: string | null;
    createdAt: Date;
    modifiedBy: number;
}

export interface ClubUpdateParams {
    id: number;
    name: string;
    address: string | null;
    city: string | null;
    description: string | null;
    contactInfo: string | null;
    isActive: boolean;
    ratingChatId: string | null;
    ratingTopicId: string | null;
    modifiedAt: Date;
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
    ratingChatId: string | null;
    ratingTopicId: string | null;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
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
        ratingChatId: dbEntity.ratingChatId,
        ratingTopicId: dbEntity.ratingTopicId,
        createdAt: new Date(dbEntity.createdAt),
        modifiedAt: new Date(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy
    };
}
