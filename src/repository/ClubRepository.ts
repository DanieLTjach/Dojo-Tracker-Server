import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import { booleanToInteger } from '../db/dbUtils.ts';
import type { Club, ClubTelegramTopics } from '../model/ClubModels.ts';

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
                currentRatingEventId,
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
                currentRatingEventId,
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
                currentRatingEventId,
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
        createdAt: string;
        modifiedAt: string;
        modifiedBy: number;
    }, { id: number }> {
        return dbManager.db.prepare(`
            INSERT INTO club (name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
            VALUES (:name, :address, :city, :description, :contactInfo, :isActive, :createdAt, :modifiedAt, :modifiedBy)
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

    private updateClubStatusStatement(): Statement<{
        id: number;
        isActive: number;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            UPDATE club
            SET isActive = :isActive,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE id = :id
        `);
    }

    updateClubStatus(id: number, isActive: boolean, modifiedBy: number, modifiedAt: Date): void {
        this.updateClubStatusStatement().run({
            id,
            isActive: booleanToInteger(isActive),
            modifiedBy,
            modifiedAt: modifiedAt.toISOString()
        });
    }

    private updateCurrentRatingEventStatement(): Statement<{
        clubId: number;
        currentRatingEventId: number | null;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            UPDATE club
            SET currentRatingEventId = :currentRatingEventId,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
            WHERE id = :clubId
        `);
    }

    updateCurrentRatingEvent(clubId: number, currentRatingEventId: number | null, modifiedAt: Date, modifiedBy: number): void {
        this.updateCurrentRatingEventStatement().run({
            clubId,
            currentRatingEventId,
            modifiedAt: modifiedAt.toISOString(),
            modifiedBy
        });
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

    private getClubTelegramTopicsStatement(): Statement<{ clubId: number }, ClubTelegramTopicsDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                rating,
                userLogs,
                gameLogs,
                clubLogs,
                poll
            FROM clubTelegramTopics
            WHERE clubId = :clubId
        `);
    }

    getClubTelegramTopics(clubId: number): ClubTelegramTopics | undefined {
        const dbEntity = this.getClubTelegramTopicsStatement().get({ clubId });
        return dbEntity !== undefined ? clubTelegramTopicsFromDBEntity(dbEntity) : undefined;
    }

    private setClubTelegramTopicsStatement(): Statement<{
        clubId: number;
        rating: string | null;
        userLogs: string | null;
        gameLogs: string | null;
        clubLogs: string | null;
        poll: string | null;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO clubTelegramTopics (clubId, rating, userLogs, gameLogs, clubLogs, poll, createdAt, modifiedAt, modifiedBy)
            VALUES (:clubId, :rating, :userLogs, :gameLogs, :clubLogs, :poll, :modifiedAt, :modifiedAt, :modifiedBy)
            ON CONFLICT(clubId) DO UPDATE SET
                rating = :rating,
                userLogs = :userLogs,
                gameLogs = :gameLogs,
                clubLogs = :clubLogs,
                poll = :poll,
                modifiedAt = :modifiedAt,
                modifiedBy = :modifiedBy
        `);
    }

    setClubTelegramTopics(clubId: number, topics: ClubTelegramTopics, modifiedAt: Date, modifiedBy: number): void {
        this.setClubTelegramTopicsStatement().run({
            clubId,
            rating: topics.rating ? JSON.stringify(topics.rating) : null,
            userLogs: topics.userLogs ? JSON.stringify(topics.userLogs) : null,
            gameLogs: topics.gameLogs ? JSON.stringify(topics.gameLogs) : null,
            clubLogs: topics.clubLogs ? JSON.stringify(topics.clubLogs) : null,
            poll: topics.poll ? JSON.stringify(topics.poll) : null,
            modifiedAt: modifiedAt.toISOString(),
            modifiedBy
        });
    }
}

export interface ClubCreateParams {
    name: string;
    address: string | null;
    city: string | null;
    description: string | null;
    contactInfo: string | null;
    isActive: boolean;
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
    currentRatingEventId: number | null;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
}

interface ClubTelegramTopicsDBEntity {
    rating: string | null;
    userLogs: string | null;
    gameLogs: string | null;
    clubLogs: string | null;
    poll: string | null;
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
        currentRatingEventId: dbEntity.currentRatingEventId,
        createdAt: new Date(dbEntity.createdAt),
        modifiedAt: new Date(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy
    };
}

function clubTelegramTopicsFromDBEntity(dbEntity: ClubTelegramTopicsDBEntity): ClubTelegramTopics {
    return {
        rating: dbEntity.rating ? JSON.parse(dbEntity.rating) : null,
        userLogs: dbEntity.userLogs ? JSON.parse(dbEntity.userLogs) : null,
        gameLogs: dbEntity.gameLogs ? JSON.parse(dbEntity.gameLogs) : null,
        clubLogs: dbEntity.clubLogs ? JSON.parse(dbEntity.clubLogs) : null,
        poll: dbEntity.poll ? JSON.parse(dbEntity.poll) : null
    }
}
