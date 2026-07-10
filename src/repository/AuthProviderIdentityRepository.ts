import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import { parseAuthProvider } from '../util/EnumUtil.ts';
import type {
    AuthProvider,
    AuthProviderIdentity,
    VerifiedExternalProfile,
} from '../model/AuthProviderModels.ts';

export class AuthProviderIdentityRepository {
    private findIdentityStatement(): Statement<{
        provider: AuthProvider;
        providerUserId: string;
    }, AuthProviderIdentityDBEntity> {
        return dbManager.db.prepare(`
            SELECT *
            FROM authProviderIdentity
            WHERE provider = :provider AND providerUserId = :providerUserId`);
    }

    findIdentity(provider: AuthProvider, providerUserId: string): AuthProviderIdentity | undefined {
        const identity = this.findIdentityStatement().get({ provider, providerUserId });
        return identity !== undefined ? authProviderIdentityFromDBEntity(identity) : undefined;
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
