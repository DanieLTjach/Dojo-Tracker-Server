import { dbManager } from '../db/dbInit.ts';
import type { AuthLinkCode } from '../model/AuthProviderModels.ts';

export class AuthLinkCodeRepository {
    replaceForUser(codeHash: string, userId: number, createdAt: Date, expiresAt: Date): void {
        dbManager.db.prepare('DELETE FROM authLinkCode WHERE userId = :userId').run({ userId });
        dbManager.db.prepare(`
            INSERT INTO authLinkCode (codeHash, userId, createdAt, expiresAt)
            VALUES (:codeHash, :userId, :createdAt, :expiresAt)`).run({
            codeHash,
            userId,
            createdAt: createdAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
        });
    }

    findValidByHash(codeHash: string, now: Date): AuthLinkCode | undefined {
        const row = dbManager.db.prepare(`
            SELECT * FROM authLinkCode
            WHERE codeHash = :codeHash AND expiresAt > :now`).get({
            codeHash,
            now: now.toISOString(),
        }) as AuthLinkCodeRow | undefined;
        return row === undefined
            ? undefined
            : {
                codeHash: row.codeHash,
                userId: row.userId,
                createdAt: new Date(row.createdAt),
                expiresAt: new Date(row.expiresAt),
            };
    }

    deleteByHash(codeHash: string): void {
        dbManager.db.prepare('DELETE FROM authLinkCode WHERE codeHash = :codeHash').run({ codeHash });
    }

    deleteExpired(now: Date): void {
        dbManager.db.prepare('DELETE FROM authLinkCode WHERE expiresAt <= :now').run({ now: now.toISOString() });
    }
}

interface AuthLinkCodeRow {
    codeHash: string;
    userId: number;
    createdAt: string;
    expiresAt: string;
}
