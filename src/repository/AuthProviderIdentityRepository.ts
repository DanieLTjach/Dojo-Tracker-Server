import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import { parseAuthProvider, parseUserStatus } from '../util/EnumUtil.ts';
import type {
    AuthProvider,
    AuthProviderIdentity,
    AuthProviderIdentityWithUser,
    VerifiedExternalProfile,
} from '../model/AuthProviderModels.ts';
import type { User } from '../model/UserModels.ts';

export class AuthProviderIdentityRepository {
    private findIdentityStatement(): Statement<{
        provider: AuthProvider;
        providerUserId: string;
    }, AuthProviderIdentityWithUserDBEntity> {
        return dbManager.db.prepare(`
            SELECT
                api.*,
                u.id AS u_id,
                u.name AS u_name,
                u.telegramUsername AS u_telegramUsername,
                u.telegramId AS u_telegramId,
                u.isAdmin AS u_isAdmin,
                u.isActive AS u_isActive,
                u.status AS u_status,
                u.createdAt AS u_createdAt,
                u.modifiedAt AS u_modifiedAt,
                u.modifiedBy AS u_modifiedBy,
                p.firstNameEn AS p_firstNameEn,
                p.lastNameEn AS p_lastNameEn,
                p.firstName AS p_firstName,
                p.lastName AS p_lastName,
                p.emaNumber AS p_emaNumber,
                p.hideProfile AS p_hideProfile
            FROM authProviderIdentity api
            JOIN user u ON api.userId = u.id
            LEFT JOIN profile p ON u.id = p.userId
            WHERE api.provider = :provider AND api.providerUserId = :providerUserId`);
    }

    findIdentity(provider: AuthProvider, providerUserId: string): AuthProviderIdentityWithUser | undefined {
        const identity = this.findIdentityStatement().get({ provider, providerUserId });
        return identity !== undefined ? authProviderIdentityWithUserFromDBEntity(identity) : undefined;
    }

    private findIdentityByUserAndProviderStatement(): Statement<{
        userId: number;
        provider: AuthProvider;
    }, AuthProviderIdentityDBEntity> {
        return dbManager.db.prepare(`
            SELECT *
            FROM authProviderIdentity
            WHERE userId = :userId AND provider = :provider`);
    }

    findIdentityByUserAndProvider(userId: number, provider: AuthProvider): AuthProviderIdentity | undefined {
        const identity = this.findIdentityByUserAndProviderStatement().get({ userId, provider });
        return identity !== undefined ? authProviderIdentityFromDBEntity(identity) : undefined;
    }

    private findIdentitiesByUserIdStatement(): Statement<{ userId: number }, AuthProviderIdentityDBEntity> {
        return dbManager.db.prepare(`
            SELECT *
            FROM authProviderIdentity
            WHERE userId = :userId
            ORDER BY provider`);
    }

    findIdentitiesByUserId(userId: number): AuthProviderIdentity[] {
        return this.findIdentitiesByUserIdStatement().all({ userId }).map(authProviderIdentityFromDBEntity);
    }

    private createIdentityStatement(): Statement<{
        userId: number;
        provider: AuthProvider;
        providerUserId: string;
        displayName: string | null;
        email: string | null;
        username: string | null;
        timestamp: string;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO authProviderIdentity (
                userId,
                provider,
                providerUserId,
                displayName,
                email,
                username,
                createdAt,
                modifiedAt
            )
            VALUES (
                :userId,
                :provider,
                :providerUserId,
                :displayName,
                :email,
                :username,
                :timestamp,
                :timestamp
            )`);
    }

    createIdentity(userId: number, profile: VerifiedExternalProfile): AuthProviderIdentity {
        this.createIdentityStatement().run({
            userId,
            provider: profile.provider,
            providerUserId: profile.providerUserId,
            displayName: profile.displayName ?? null,
            email: profile.email ?? null,
            username: profile.username ?? null,
            timestamp: new Date().toISOString(),
        });

        return this.findIdentityByUserAndProvider(userId, profile.provider)!;
    }
}

interface AuthProviderIdentityDBEntity {
    id: number;
    userId: number;
    provider: string;
    providerUserId: string;
    displayName: string | null;
    email: string | null;
    username: string | null;
    createdAt: string;
    modifiedAt: string;
}

interface AuthProviderIdentityWithUserDBEntity extends AuthProviderIdentityDBEntity {
    u_id: number;
    u_name: string;
    u_telegramUsername: string | null;
    u_telegramId: number | null;
    u_isAdmin: number;
    u_isActive: number;
    u_status: string;
    u_createdAt: string;
    u_modifiedAt: string;
    u_modifiedBy: string;
    p_firstNameEn: string | null;
    p_lastNameEn: string | null;
    p_firstName: string | null;
    p_lastName: string | null;
    p_emaNumber: string | null;
    p_hideProfile: number | null;
}

function authProviderIdentityFromDBEntity(dbEntity: AuthProviderIdentityDBEntity): AuthProviderIdentity {
    return {
        id: dbEntity.id,
        userId: dbEntity.userId,
        provider: parseAuthProvider(dbEntity.provider),
        providerUserId: dbEntity.providerUserId,
        displayName: dbEntity.displayName,
        email: dbEntity.email,
        username: dbEntity.username,
        createdAt: new Date(dbEntity.createdAt),
        modifiedAt: new Date(dbEntity.modifiedAt),
    };
}

function authProviderIdentityWithUserFromDBEntity(
    dbEntity: AuthProviderIdentityWithUserDBEntity
): AuthProviderIdentityWithUser {
    return {
        ...authProviderIdentityFromDBEntity(dbEntity),
        user: userFromIdentityDBEntity(dbEntity),
    };
}

function userFromIdentityDBEntity(dbEntity: AuthProviderIdentityWithUserDBEntity): User {
    return {
        id: dbEntity.u_id,
        name: dbEntity.u_name,
        telegramUsername: dbEntity.u_telegramUsername,
        telegramId: dbEntity.u_telegramId,
        isAdmin: Boolean(dbEntity.u_isAdmin),
        isActive: Boolean(dbEntity.u_isActive),
        status: parseUserStatus(dbEntity.u_status),
        profile: dbEntity.p_hideProfile !== null
            ? {
                userId: dbEntity.u_id,
                firstNameEn: dbEntity.p_firstNameEn,
                lastNameEn: dbEntity.p_lastNameEn,
                firstName: dbEntity.p_firstName,
                lastName: dbEntity.p_lastName,
                emaNumber: dbEntity.p_emaNumber,
                hideProfile: Boolean(dbEntity.p_hideProfile),
            }
            : null,
        createdAt: new Date(dbEntity.u_createdAt),
        modifiedAt: new Date(dbEntity.u_modifiedAt),
        modifiedBy: dbEntity.u_modifiedBy,
    };
}
