import { dbManager } from '../db/dbInit.ts';
import type { ComputedAchievementState } from '../util/AutomaticAchievementEvaluator.ts';

interface AutomaticAchievementStateDBEntity {
    id: number;
    userId: number;
    code: string;
    scope: string;
    progress: number;
    target: number;
    unlockedAt: string | null;
    sourceEventId: number | null;
    sourceGameId: number | null;
    sourceRoundNumber: number | null;
    value: number | null;
    computedAt: string;
}

function stateFromDBEntity(entity: AutomaticAchievementStateDBEntity): ComputedAchievementState {
    return {
        userId: entity.userId,
        code: entity.code,
        scope: entity.scope,
        progress: entity.progress,
        target: entity.target,
        unlockedAt: entity.unlockedAt !== null ? new Date(entity.unlockedAt) : null,
        sourceEventId: entity.sourceEventId,
        sourceGameId: entity.sourceGameId,
        sourceRoundNumber: entity.sourceRoundNumber,
        value: entity.value,
    };
}

export class AutomaticAchievementRepository {
    private selectQuery = `
        SELECT id, userId, code, scope, progress, target, unlockedAt, sourceEventId, sourceGameId, sourceRoundNumber, value, computedAt
        FROM automaticAchievementState
    `;

    findStatesByUserId(userId: number): ComputedAchievementState[] {
        const stmt = dbManager.db.prepare(`${this.selectQuery} WHERE userId = :userId ORDER BY code, scope`);
        const rows = stmt.all({ userId }) as AutomaticAchievementStateDBEntity[];
        return rows.map(stateFromDBEntity);
    }

    findUnlockedStatesByUserId(userId: number): ComputedAchievementState[] {
        const stmt = dbManager.db.prepare(
            `${this.selectQuery} WHERE userId = :userId AND unlockedAt IS NOT NULL ORDER BY unlockedAt DESC`
        );
        const rows = stmt.all({ userId }) as AutomaticAchievementStateDBEntity[];
        return rows.map(stateFromDBEntity);
    }

    findProgressStatesByUserId(userId: number): (ComputedAchievementState & { computedAt: Date })[] {
        const stmt = dbManager.db.prepare(
            `${this.selectQuery} WHERE userId = :userId AND unlockedAt IS NULL AND progress > 0 ORDER BY code, scope`
        );
        const rows = stmt.all({ userId }) as AutomaticAchievementStateDBEntity[];
        return rows.map(r => ({
            ...stateFromDBEntity(r),
            computedAt: new Date(r.computedAt),
        }));
    }

    deleteStatesForUser(userId: number): void {
        dbManager.db.prepare('DELETE FROM automaticAchievementState WHERE userId = :userId').run({ userId });
    }

    replaceUserStatesTransactionally(userId: number, states: ComputedAchievementState[], computedAt: Date): void {
        const isoComputed = computedAt.toISOString();

        dbManager.db.transaction(() => {
            this.deleteStatesForUser(userId);

            const insertStmt = dbManager.db.prepare(`
                INSERT INTO automaticAchievementState (
                    userId, code, scope, progress, target, unlockedAt,
                    sourceEventId, sourceGameId, sourceRoundNumber, value, computedAt
                ) VALUES (
                    :userId, :code, :scope, :progress, :target, :unlockedAt,
                    :sourceEventId, :sourceGameId, :sourceRoundNumber, :value, :computedAt
                )
            `);

            for (const s of states) {
                insertStmt.run({
                    userId: s.userId,
                    code: s.code,
                    scope: s.scope,
                    progress: s.progress,
                    target: s.target,
                    unlockedAt: s.unlockedAt !== null ? s.unlockedAt.toISOString() : null,
                    sourceEventId: s.sourceEventId,
                    sourceGameId: s.sourceGameId,
                    sourceRoundNumber: s.sourceRoundNumber,
                    value: s.value,
                    computedAt: isoComputed,
                });
            }
        })();
    }

    replaceAllStatesTransactionally(states: ComputedAchievementState[], computedAt: Date): void {
        const isoComputed = computedAt.toISOString();

        dbManager.db.transaction(() => {
            dbManager.db.prepare('DELETE FROM automaticAchievementState').run();

            const insertStmt = dbManager.db.prepare(`
                INSERT INTO automaticAchievementState (
                    userId, code, scope, progress, target, unlockedAt,
                    sourceEventId, sourceGameId, sourceRoundNumber, value, computedAt
                ) VALUES (
                    :userId, :code, :scope, :progress, :target, :unlockedAt,
                    :sourceEventId, :sourceGameId, :sourceRoundNumber, :value, :computedAt
                )
            `);

            for (const s of states) {
                try {
                    insertStmt.run({
                        userId: s.userId,
                        code: s.code,
                        scope: s.scope,
                        progress: s.progress,
                        target: s.target,
                        unlockedAt: s.unlockedAt !== null ? s.unlockedAt.toISOString() : null,
                        sourceEventId: s.sourceEventId,
                        sourceGameId: s.sourceGameId,
                        sourceRoundNumber: s.sourceRoundNumber,
                        value: s.value,
                        computedAt: isoComputed,
                    });
                } catch (err: any) {
                    throw new Error(
                        `Failed to insert automatic achievement state s=${JSON.stringify(s)}: ${err.message}`
                    );
                }
            }
        })();
    }
}
