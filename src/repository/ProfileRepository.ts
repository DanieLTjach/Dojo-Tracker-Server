import type { Statement } from 'better-sqlite3';
import type { Profile, ProfileValues } from '../model/ProfileModels.ts';
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

    private upsertProfileStatement(): Statement<ProfileUpsertParams, void> {
        return dbManager.db.prepare(`
            INSERT INTO profile (userId, firstNameEn, lastNameEn, firstName, lastName, emaNumber, locale, hideProfile, modifiedBy, modifiedAt)
            VALUES (:userId, :firstNameEn, :lastNameEn, :firstName, :lastName, :emaNumber, :locale, :hideProfile, :modifiedBy, :timestamp)
            ON CONFLICT(userId) DO UPDATE SET
                firstNameEn = :firstNameEn,
                lastNameEn = :lastNameEn,
                firstName = :firstName,
                lastName = :lastName,
                emaNumber = :emaNumber,
                locale = :locale,
                hideProfile = :hideProfile,
                modifiedBy = :modifiedBy,
                modifiedAt = :timestamp`);
    }

    upsertProfile(userId: number, values: ProfileValues, modifiedBy: number): void {
        this.upsertProfileStatement().run({
            userId,
            firstNameEn: values.firstNameEn,
            lastNameEn: values.lastNameEn,
            firstName: values.firstName,
            lastName: values.lastName,
            emaNumber: values.emaNumber,
            locale: values.locale ?? null,
            hideProfile: booleanToInteger(values.hideProfile),
            modifiedBy,
            timestamp: new Date().toISOString(),
        });
    }

    private updateProfileNamesStatement(): Statement<{
        userId: number;
        firstName: string | null;
        lastName: string | null;
        modifiedBy: number;
        timestamp: string;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO profile (userId, firstName, lastName, hideProfile, modifiedBy, modifiedAt)
            VALUES (:userId, :firstName, :lastName, 0, :modifiedBy, :timestamp)
            ON CONFLICT(userId) DO UPDATE SET
                firstName = COALESCE(:firstName, firstName),
                lastName = COALESCE(:lastName, lastName),
                modifiedBy = :modifiedBy,
                modifiedAt = :timestamp`);
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
            timestamp: new Date().toISOString(),
        });
    }
}

interface ProfileUpsertParams {
    userId: number;
    firstNameEn: string | null;
    lastNameEn: string | null;
    firstName: string | null;
    lastName: string | null;
    emaNumber: string | null;
    locale: string | null;
    hideProfile: number;
    modifiedBy: number;
    timestamp: string;
}

interface ProfileDBEntity {
    userId: number;
    firstNameEn: string | null;
    lastNameEn: string | null;
    firstName: string | null;
    lastName: string | null;
    emaNumber: string | null;
    locale: string | null;
    hideProfile: number;
    avatarUrl?: string | null;
    statusLine?: string | null;
    birthDay?: number | null;
    birthMonth?: number | null;
    birthYear?: number | null;
    hideBirthYear?: number;
    city?: string | null;
    favouriteYaku?: string | null;
    favouriteTile?: string | null;
    discord?: string | null;
    majsoulAccount?: string | null;
    tenhouAccount?: string | null;
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
        locale: dbEntity.locale,
        hideProfile: Boolean(dbEntity.hideProfile),
        avatarUrl: dbEntity.avatarUrl ?? null,
        statusLine: dbEntity.statusLine ?? null,
        birthDay: dbEntity.birthDay ?? null,
        birthMonth: dbEntity.birthMonth ?? null,
        birthYear: dbEntity.birthYear ?? null,
        hideBirthYear: Boolean(dbEntity.hideBirthYear),
        city: dbEntity.city ?? null,
        favouriteYaku: dbEntity.favouriteYaku ?? null,
        favouriteTile: dbEntity.favouriteTile ?? null,
        discord: dbEntity.discord ?? null,
        majsoulAccount: dbEntity.majsoulAccount ?? null,
        tenhouAccount: dbEntity.tenhouAccount ?? null,
    };
}
