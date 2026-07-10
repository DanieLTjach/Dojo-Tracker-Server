import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type {
    PendingExternalAuthRegistration,
    VerifiedExternalProfile,
} from '../model/AuthProviderModels.ts';
import { parseAuthProvider } from '../util/EnumUtil.ts';

export class PendingExternalAuthRegistrationRepository {
    private deleteForIdentityStatement(): Statement<{
        provider: string;
        providerUserId: string;
    }, void> {
        return dbManager.db.prepare(`
            DELETE FROM pendingExternalAuthRegistration
            WHERE provider = :provider AND providerUserId = :providerUserId`);
    }

    private createStatement(): Statement<{
        tokenHash: string;
        provider: string;
        providerUserId: string;
        profileJson: string;
        createdAt: string;
        expiresAt: string;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO pendingExternalAuthRegistration (
                tokenHash,
                provider,
                providerUserId,
                profileJson,
                createdAt,
                expiresAt
            ) VALUES (
                :tokenHash,
                :provider,
                :providerUserId,
                :profileJson,
                :createdAt,
                :expiresAt
            )`);
    }

    create(
        tokenHash: string,
        profile: VerifiedExternalProfile,
        createdAt: Date,
        expiresAt: Date
    ): void {
        this.deleteForIdentityStatement().run({
            provider: profile.provider,
            providerUserId: profile.providerUserId,
        });
        this.createStatement().run({
            tokenHash,
            provider: profile.provider,
            providerUserId: profile.providerUserId,
            profileJson: JSON.stringify(profile),
            createdAt: createdAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
        });
    }

    private findByTokenHashStatement(): Statement<{ tokenHash: string }, PendingExternalAuthRegistrationDBEntity> {
        return dbManager.db.prepare(`
            SELECT *
            FROM pendingExternalAuthRegistration
            WHERE tokenHash = :tokenHash`);
    }

    findByTokenHash(tokenHash: string): PendingExternalAuthRegistration | undefined {
        const row = this.findByTokenHashStatement().get({ tokenHash });
        return row === undefined ? undefined : pendingRegistrationFromDBEntity(row);
    }

    deleteByTokenHash(tokenHash: string): void {
        dbManager.db.prepare(`
            DELETE FROM pendingExternalAuthRegistration
            WHERE tokenHash = :tokenHash`).run({ tokenHash });
    }

    deleteExpired(now: Date): void {
        dbManager.db.prepare(`
            DELETE FROM pendingExternalAuthRegistration
            WHERE expiresAt <= :now`).run({ now: now.toISOString() });
    }
}

interface PendingExternalAuthRegistrationDBEntity {
    tokenHash: string;
    provider: string;
    providerUserId: string;
    profileJson: string;
    createdAt: string;
    expiresAt: string;
}

function pendingRegistrationFromDBEntity(
    row: PendingExternalAuthRegistrationDBEntity
): PendingExternalAuthRegistration {
    const storedProfile = JSON.parse(row.profileJson) as VerifiedExternalProfile;
    return {
        tokenHash: row.tokenHash,
        profile: {
            ...storedProfile,
            provider: parseAuthProvider(row.provider),
            providerUserId: row.providerUserId,
        },
        createdAt: new Date(row.createdAt),
        expiresAt: new Date(row.expiresAt),
    };
}
