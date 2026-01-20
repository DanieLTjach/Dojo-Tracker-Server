import type { Statement } from 'better-sqlite3';
import type { User } from '../model/UserModels.ts';
import { dbManager } from '../db/dbInit.ts';
import { booleanToInteger, dateFromSqliteString } from '../db/dbUtils.ts';

export class UserRepository {

    private findAllUsersStatement(): Statement<unknown[], UserDBEntity> {
        return dbManager.db.prepare('SELECT * FROM user ORDER BY id');
    }

    findAllUsers(): User[] {
        return this.findAllUsersStatement().all().map(userFromDBEntity);
    }

    private findUserByIdStatement(): Statement<{ id: number }, UserDBEntity> {
        return dbManager.db.prepare('SELECT * FROM user WHERE id = :id');
    }

    findUserById(id: number): User | undefined {
        const userDBEntity = this.findUserByIdStatement().get({ id });
        return userDBEntity !== undefined ? userFromDBEntity(userDBEntity) : undefined;
    }

    private findUserByTelegramIdStatement(): Statement<{ telegramId: number }, UserDBEntity> {
        return dbManager.db.prepare('SELECT * FROM user WHERE telegramId = :telegramId');
    }

    findUserByTelegramId(telegramId: number): User | undefined {
        const userDBEntity = this.findUserByTelegramIdStatement().get({ telegramId });
        return userDBEntity !== undefined ? userFromDBEntity(userDBEntity) : undefined;
    }

    private findUserByTelegramUsernameStatement(): Statement<{ telegramUsername: string }, UserDBEntity> {
        return dbManager.db.prepare('SELECT * FROM user WHERE telegramUsername = :telegramUsername');
    }

    findUserByTelegramUsername(telegramUsername: string): User | undefined {
        const userDBEntity = this.findUserByTelegramUsernameStatement().get({ telegramUsername: telegramUsername });
        return userDBEntity !== undefined ? userFromDBEntity(userDBEntity) : undefined;
    }

    private findUserByNameStatement(): Statement<{ name: string }, UserDBEntity> {
        return dbManager.db.prepare('SELECT * FROM user WHERE name = :name');
    }

    findUserByName(name: string): User | undefined {
        const userDBEntity = this.findUserByNameStatement().get({ name });
        return userDBEntity !== undefined ? userFromDBEntity(userDBEntity) : undefined;
    }

    private registerUserStatement(): Statement<{
        name: string,
        telegramUsername: string | undefined,
        telegramId: number | undefined,
        modifiedBy: number
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO user (name, telegramUsername, telegramId, modifiedBy) 
            VALUES (:name, :telegramUsername, :telegramId, :modifiedBy)`
        );
    }

    registerUser(name: string, telegramUsername: string | undefined, telegramId: number | undefined, createdBy: number): number {
        return Number(this.registerUserStatement().run({ name, telegramUsername, telegramId, modifiedBy: createdBy }).lastInsertRowid);
    }

    private updateUserNameStatement(): Statement<{
        name: string,
        modifiedBy: number,
        id: number
    }, void> {
        return dbManager.db.prepare(`
            UPDATE user
            SET name = :name, modifiedBy = :modifiedBy, modifiedAt = CURRENT_TIMESTAMP
            WHERE id = :id`
        );
    }

    updateUserName(userId: number, name: string, modifiedBy: number) {
        this.updateUserNameStatement().run({ name, modifiedBy, id: userId });
    }

    private updateUserTelegramUsernameStatement(): Statement<{
        telegramUsername: string,
        modifiedBy: number,
        id: number
    }, void> {
        return dbManager.db.prepare(`
            UPDATE user
            SET telegramUsername = :telegramUsername, modifiedBy = :modifiedBy, modifiedAt = CURRENT_TIMESTAMP
            WHERE id = :id`
        );
    }

    updateUserTelegramUsername(userId: number, telegramUsername: string, modifiedBy: number) {
        this.updateUserTelegramUsernameStatement().run({ telegramUsername, modifiedBy, id: userId });
    }

    private updateUserActivationStatusStatement(): Statement<{
        isActive: number,
        modifiedBy: number,
        id: number
    }, void> {
        return dbManager.db.prepare(`
            UPDATE user
            SET isActive = :isActive, modifiedBy = :modifiedBy, modifiedAt = CURRENT_TIMESTAMP
            WHERE id = :id`
        );
    }

    updateUserActivationStatus(userId: number, newStatus: boolean, modifiedBy: number) {
        this.updateUserActivationStatusStatement().run({ isActive: booleanToInteger(newStatus), modifiedBy, id: userId });
    }
}

interface UserDBEntity {
    id: number;
    name: string;
    telegramUsername: string | null;
    telegramId: number | null;
    isAdmin: number;
    isActive: number;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: string;
}

function userFromDBEntity(dbEntity: UserDBEntity): User {
    return {
        ...dbEntity,
        isAdmin: Boolean(dbEntity.isAdmin),
        isActive: Boolean(dbEntity.isActive),
        createdAt: dateFromSqliteString(dbEntity.createdAt),
        modifiedAt: dateFromSqliteString(dbEntity.modifiedAt)
    };
}