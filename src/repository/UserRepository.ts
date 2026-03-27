import type { Statement } from 'better-sqlite3';
import type { User, UserStatus } from '../model/UserModels.ts';
import { dbManager } from '../db/dbInit.ts';
import { booleanToInteger } from '../db/dbUtils.ts';
import { parseUserStatus } from '../util/EnumUtil.ts';

export class UserRepository {

    private findAllUsersStatement(): Statement<unknown[], UserWithProfileDBEntity> {
        return dbManager.db.prepare(`
            SELECT user.*,
                p.firstNameEn as p_firstNameEn,
                p.lastNameEn as p_lastNameEn,
                p.emaNumber as p_emaNumber,
                p.hideProfile as p_hideProfile
            FROM user
            LEFT JOIN profile p ON user.id = p.userId
            LEFT JOIN (
                SELECT userId, MAX(game.createdAt) as lastGameDate
                FROM userToGame
                JOIN game ON userToGame.gameId = game.id
                GROUP BY userId
            ) lastGame ON user.id = lastGame.userId
            WHERE user.id != 0
            ORDER BY lastGame.lastGameDate DESC NULLS LAST, user.id
        `);
    }

    findAllUsers(): User[] {
        return this.findAllUsersStatement().all().map(userWithProfileFromDBEntity);
    }

    private findAllUsersByClubIdStatement(): Statement<{ clubId: number }, UserWithProfileDBEntity> {
        return dbManager.db.prepare(`
            SELECT user.*,
                p.firstNameEn as p_firstNameEn,
                p.lastNameEn as p_lastNameEn,
                p.emaNumber as p_emaNumber,
                p.hideProfile as p_hideProfile
            FROM user
            JOIN clubMembership cm ON user.id = cm.userId
            LEFT JOIN profile p ON user.id = p.userId
            LEFT JOIN (
                SELECT userId, MAX(game.createdAt) as lastGameDate
                FROM userToGame
                JOIN game ON userToGame.gameId = game.id
                GROUP BY userId
            ) lastGame ON user.id = lastGame.userId
            WHERE user.id != 0
                AND cm.clubId = :clubId
                AND cm.status = 'ACTIVE'
            ORDER BY lastGame.lastGameDate DESC NULLS LAST, user.id
        `);
    }

    findAllUsersByClubId(clubId: number): User[] {
        return this.findAllUsersByClubIdStatement().all({ clubId }).map(userWithProfileFromDBEntity);
    }

    private findUserByIdStatement(): Statement<{ id: number }, UserWithProfileDBEntity> {
        return dbManager.db.prepare(`
            SELECT user.*,
                p.firstNameEn as p_firstNameEn,
                p.lastNameEn as p_lastNameEn,
                p.emaNumber as p_emaNumber,
                p.hideProfile as p_hideProfile
            FROM user
            LEFT JOIN profile p ON user.id = p.userId
            WHERE user.id = :id`
        );
    }

    findUserById(id: number): User | undefined {
        const userDBEntity = this.findUserByIdStatement().get({ id });
        return userDBEntity !== undefined ? userWithProfileFromDBEntity(userDBEntity) : undefined;
    }

    private findUserByTelegramIdStatement(): Statement<{ telegramId: number }, UserWithProfileDBEntity> {
        return dbManager.db.prepare(`
            SELECT user.*,
                p.firstNameEn as p_firstNameEn,
                p.lastNameEn as p_lastNameEn,
                p.emaNumber as p_emaNumber,
                p.hideProfile as p_hideProfile
            FROM user
            LEFT JOIN profile p ON user.id = p.userId
            WHERE telegramId = :telegramId`
        );
    }

    findUserByTelegramId(telegramId: number): User | undefined {
        const userDBEntity = this.findUserByTelegramIdStatement().get({ telegramId });
        return userDBEntity !== undefined ? userWithProfileFromDBEntity(userDBEntity) : undefined;
    }

    private findUserByTelegramUsernameStatement(): Statement<{ telegramUsername: string }, UserWithProfileDBEntity> {
        return dbManager.db.prepare(`
            SELECT user.*,
                p.firstNameEn as p_firstNameEn,
                p.lastNameEn as p_lastNameEn,
                p.emaNumber as p_emaNumber,
                p.hideProfile as p_hideProfile
            FROM user
            LEFT JOIN profile p ON user.id = p.userId
            WHERE telegramUsername = :telegramUsername`
        );
    }

    findUserByTelegramUsername(telegramUsername: string): User | undefined {
        const userDBEntity = this.findUserByTelegramUsernameStatement().get({ telegramUsername: telegramUsername });
        return userDBEntity !== undefined ? userWithProfileFromDBEntity(userDBEntity) : undefined;
    }

    private findUserByNameStatement(): Statement<{ name: string }, UserWithProfileDBEntity> {
        return dbManager.db.prepare(`
            SELECT user.*,
                p.firstNameEn as p_firstNameEn,
                p.lastNameEn as p_lastNameEn,
                p.emaNumber as p_emaNumber,
                p.hideProfile as p_hideProfile
            FROM user
            LEFT JOIN profile p ON user.id = p.userId
            WHERE name = :name`
        );
    }

    findUserByName(name: string): User | undefined {
        const userDBEntity = this.findUserByNameStatement().get({ name });
        return userDBEntity !== undefined ? userWithProfileFromDBEntity(userDBEntity) : undefined;
    }

    private registerUserStatement(): Statement<{
        name: string,
        telegramUsername: string | undefined,
        telegramId: number | undefined,
        modifiedBy: number,
        isActive: number,
        status: UserStatus,
        timestamp: string
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO user (name, telegramUsername, telegramId, modifiedBy, isActive, status, createdAt, modifiedAt)
            VALUES (:name, :telegramUsername, :telegramId, :modifiedBy, :isActive, :status, :timestamp, :timestamp)`
        );
    }

    registerUser(name: string, telegramUsername: string | undefined, telegramId: number | undefined, createdBy: number): number {
        return Number(this.registerUserStatement().run({
            name,
            telegramUsername,
            telegramId,
            modifiedBy: createdBy,
            isActive: booleanToInteger(true),
            status: 'ACTIVE',
            timestamp: new Date().toISOString()
        }).lastInsertRowid);
    }

    private updateUserNameStatement(): Statement<{
        name: string,
        modifiedBy: number,
        id: number,
        timestamp: string
    }, void> {
        return dbManager.db.prepare(`
            UPDATE user
            SET name = :name, modifiedBy = :modifiedBy, modifiedAt = :timestamp
            WHERE id = :id`
        );
    }

    updateUserName(userId: number, name: string, modifiedBy: number) {
        this.updateUserNameStatement().run({ name, modifiedBy, id: userId, timestamp: new Date().toISOString() });
    }

    private updateUserTelegramUsernameStatement(): Statement<{
        telegramUsername: string,
        modifiedBy: number,
        id: number,
        timestamp: string
    }, void> {
        return dbManager.db.prepare(`
            UPDATE user
            SET telegramUsername = :telegramUsername, modifiedBy = :modifiedBy, modifiedAt = :timestamp
            WHERE id = :id`
        );
    }

    updateUserTelegramUsername(userId: number, telegramUsername: string, modifiedBy: number) {
        this.updateUserTelegramUsernameStatement().run({ telegramUsername, modifiedBy, id: userId, timestamp: new Date().toISOString() });
    }

    private updateUserStatusStatement(): Statement<{
        isActive: number,
        status: UserStatus,
        modifiedBy: number,
        id: number,
        timestamp: string
    }, void> {
        return dbManager.db.prepare(`
            UPDATE user
            SET isActive = :isActive, status = :status, modifiedBy = :modifiedBy, modifiedAt = :timestamp
            WHERE id = :id`
        );
    }

    updateUserStatus(userId: number, newIsActive: boolean, newStatus: UserStatus, modifiedBy: number) {
        this.updateUserStatusStatement().run({
            isActive: booleanToInteger(newIsActive),
            status: newStatus,
            modifiedBy,
            id: userId,
            timestamp: new Date().toISOString()
        });
    }
}

interface UserWithProfileDBEntity {
    id: number;
    name: string;
    telegramUsername: string | null;
    telegramId: number | null;
    isAdmin: number;
    isActive: number;
    status: string;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: string;
    p_firstNameEn: string | null;
    p_lastNameEn: string | null;
    p_emaNumber: string | null;
    p_hideProfile: number | null;
}

function userWithProfileFromDBEntity(dbEntity: UserWithProfileDBEntity): User {
    return {
        id: dbEntity.id,
        name: dbEntity.name,
        telegramUsername: dbEntity.telegramUsername,
        telegramId: dbEntity.telegramId,
        isAdmin: Boolean(dbEntity.isAdmin),
        isActive: Boolean(dbEntity.isActive),
        status: parseUserStatus(dbEntity.status),
        profile: dbEntity.p_hideProfile !== null ? {
            userId: dbEntity.id,
            firstNameEn: dbEntity.p_firstNameEn,
            lastNameEn: dbEntity.p_lastNameEn,
            emaNumber: dbEntity.p_emaNumber,
            hideProfile: Boolean(dbEntity.p_hideProfile)
        } : null,
        createdAt: new Date(dbEntity.createdAt),
        modifiedAt: new Date(dbEntity.modifiedAt),
        modifiedBy: dbEntity.modifiedBy
    };
}
