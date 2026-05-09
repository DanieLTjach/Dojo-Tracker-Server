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
        firstName: string | null,
        lastName: string | null,
        emaNumber: string | null,
        hideProfile: number,
        modifiedBy: number,
        timestamp: string
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO profile (userId, firstNameEn, lastNameEn, firstName, lastName, emaNumber, hideProfile, modifiedBy, modifiedAt)
            VALUES (:userId, :firstNameEn, :lastNameEn, :firstName, :lastName, :emaNumber, :hideProfile, :modifiedBy, :timestamp)
            ON CONFLICT(userId) DO UPDATE SET
                firstNameEn = :firstNameEn,
                lastNameEn = :lastNameEn,
                firstName = :firstName,
                lastName = :lastName,
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
        firstName: string | null,
        lastName: string | null,
        emaNumber: string | null,
        hideProfile: boolean,
        modifiedBy: number
    ): void {
        this.upsertProfileStatement().run({
            userId,
            firstNameEn,
            lastNameEn,
            firstName,
            lastName,
            emaNumber,
            hideProfile: booleanToInteger(hideProfile),
            modifiedBy,
            timestamp: new Date().toISOString()
        });
    }

    private updateProfileNamesStatement(): Statement<{
        userId: number,
        firstName: string | null,
        lastName: string | null,
        modifiedBy: number,
        timestamp: string
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO profile (userId, firstName, lastName, hideProfile, modifiedBy, modifiedAt)
            VALUES (:userId, :firstName, :lastName, 0, :modifiedBy, :timestamp)
            ON CONFLICT(userId) DO UPDATE SET
                firstName = COALESCE(:firstName, firstName),
                lastName = COALESCE(:lastName, lastName),
                modifiedBy = :modifiedBy,
                modifiedAt = :timestamp`
        );
    }

    updateProfileNames(
        userId: number,
        firstName: string | null | undefined,
        lastName: string | null | undefined,
        modifiedBy: number
    ): void {
        this.updateProfileNamesStatement().run({
            userId,
            firstName: firstName ?? null,
            lastName: lastName ?? null,
            modifiedBy,
            timestamp: new Date().toISOString()
        });
    }
}

interface ProfileDBEntity {
    userId: number;
    firstNameEn: string | null;
    lastNameEn: string | null;
    firstName: string | null;
    lastName: string | null;
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
        firstName: dbEntity.firstName,
        lastName: dbEntity.lastName,
        emaNumber: dbEntity.emaNumber,
        hideProfile: Boolean(dbEntity.hideProfile)
    };
}
