import type { Statement } from 'better-sqlite3';
import type { Profile } from '../model/ProfileModels.ts';
import { dbManager } from '../db/dbInit.ts';
import { booleanToInteger } from '../db/dbUtils.ts';

export class ProfileRepository {

    private findProfileByUserIdStatement(): Statement<{ userId: number }, ProfileDBEntity> {
        return dbManager.db.prepare('SELECT * FROM profile WHERE userId = :userId');
    }

    findProfileByUserId(userId: number): Profile | undefined {
        const dbEntity = this.findProfileByUserIdStatement().get({ userId });
        return dbEntity !== undefined ? profileFromDBEntity(dbEntity) : undefined;
    }

    private upsertProfileStatement(): Statement<{
        userId: number,
        firstNameEn: string | null,
        lastNameEn: string | null,
        emaNumber: string | null,
        hideProfile: number,
        modifiedBy: number,
        timestamp: string
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO profile (userId, firstNameEn, lastNameEn, emaNumber, hideProfile, modifiedBy, modifiedAt)
            VALUES (:userId, :firstNameEn, :lastNameEn, :emaNumber, :hideProfile, :modifiedBy, :timestamp)
            ON CONFLICT(userId) DO UPDATE SET
                firstNameEn = :firstNameEn,
                lastNameEn = :lastNameEn,
                emaNumber = :emaNumber,
                hideProfile = :hideProfile,
                modifiedBy = :modifiedBy,
                modifiedAt = :timestamp`
        );
    }

    upsertProfile(
        userId: number,
        firstNameEn: string | null,
        lastNameEn: string | null,
        emaNumber: string | null,
        hideProfile: boolean,
        modifiedBy: number
    ): void {
        this.upsertProfileStatement().run({
            userId,
            firstNameEn,
            lastNameEn,
            emaNumber,
            hideProfile: booleanToInteger(hideProfile),
            modifiedBy,
            timestamp: new Date().toISOString()
        });
    }
}

interface ProfileDBEntity {
    userId: number;
    firstNameEn: string | null;
    lastNameEn: string | null;
    emaNumber: string | null;
    hideProfile: number;
    modifiedAt: string;
    modifiedBy: number;
}

function profileFromDBEntity(dbEntity: ProfileDBEntity): Profile {
    return {
        userId: dbEntity.userId,
        firstNameEn: dbEntity.firstNameEn,
        lastNameEn: dbEntity.lastNameEn,
        emaNumber: dbEntity.emaNumber,
        hideProfile: Boolean(dbEntity.hideProfile)
    };
}
