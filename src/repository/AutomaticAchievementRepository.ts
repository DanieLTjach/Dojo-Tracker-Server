import { dbManager } from '../db/dbInit.ts';
import {
    type ComputedAchievementState,
    type EvaluatorEventPlacement,
    type EvaluatorGame,
    type EvaluatorGamePlayer,
    type EvaluatorGameRound,
    type EvaluatorSkillGameResult,
    type EvaluatorSkillUserSnapshot,
} from '../util/AutomaticAchievementEvaluator.ts';
import { Wind } from '../model/GameModels.ts';
import type { GameRoundResult } from '../model/GameRoundResultModels.ts';
import { RatingService } from '../service/RatingService.ts';
import { toDisplaySkill } from '../util/SkillMathUtil.ts';

function chunkArray<T>(items: T[], chunkSize: number = 500): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
}

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

    findUnlockedStateByUserIdAndCode(userId: number, code: string): ComputedAchievementState | null {
        const stmt = dbManager.db.prepare(
            `${this.selectQuery} WHERE userId = :userId AND code = :code AND unlockedAt IS NOT NULL ORDER BY unlockedAt DESC LIMIT 1`
        );
        const row = stmt.get({ userId, code }) as AutomaticAchievementStateDBEntity | undefined;
        return row ? stateFromDBEntity(row) : null;
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

    findStatesBySourceGameId(sourceGameId: number): ComputedAchievementState[] {
        const stmt = dbManager.db.prepare(
            `${this.selectQuery} WHERE sourceGameId = :sourceGameId ORDER BY unlockedAt ASC, id ASC`
        );
        const rows = stmt.all({ sourceGameId }) as AutomaticAchievementStateDBEntity[];
        return rows.map(stateFromDBEntity);
    }

    findUnlockedStatesBySourceGameId(sourceGameId: number): ComputedAchievementState[] {
        const stmt = dbManager.db.prepare(
            `${this.selectQuery} WHERE sourceGameId = :sourceGameId AND unlockedAt IS NOT NULL ORDER BY unlockedAt ASC, id ASC`
        );
        const rows = stmt.all({ sourceGameId }) as AutomaticAchievementStateDBEntity[];
        return rows.map(stateFromDBEntity);
    }

    findStatesBySourceEventId(sourceEventId: number): ComputedAchievementState[] {
        const stmt = dbManager.db.prepare(
            `${this.selectQuery} WHERE sourceEventId = :sourceEventId ORDER BY unlockedAt ASC, id ASC`
        );
        const rows = stmt.all({ sourceEventId }) as AutomaticAchievementStateDBEntity[];
        return rows.map(stateFromDBEntity);
    }

    findUnlockedStatesBySourceEventId(sourceEventId: number): ComputedAchievementState[] {
        const stmt = dbManager.db.prepare(
            `${this.selectQuery} WHERE sourceEventId = :sourceEventId AND unlockedAt IS NOT NULL ORDER BY unlockedAt ASC, id ASC`
        );
        const rows = stmt.all({ sourceEventId }) as AutomaticAchievementStateDBEntity[];
        return rows.map(stateFromDBEntity);
    }

    deleteStatesForUser(userId: number): void {
        dbManager.db.prepare('DELETE FROM automaticAchievementState WHERE userId = :userId').run({ userId });
    }

    /** One notification per newly unlocked achievement. */
    private insertUnlockNotifications(unlocked: ComputedAchievementState[], isoComputed: string): void {
        if (unlocked.length === 0) return;

        // OR IGNORE against the unique index: a re-run must not duplicate.
        const notifyStmt = dbManager.db.prepare(`
            INSERT OR IGNORE INTO notification (
                userId, type, achievementCode, scope, createdAt
            ) VALUES (
                :userId, 'ACHIEVEMENT_UNLOCK', :achievementCode, :scope, :createdAt
            )
        `);

        for (const s of unlocked) {
            notifyStmt.run({
                userId: s.userId,
                achievementCode: s.code,
                scope: s.scope || 'GLOBAL',
                createdAt: isoComputed,
            });
        }
    }

    replaceUserStatesTransactionally(userId: number, states: ComputedAchievementState[], computedAt: Date): void {
        const isoComputed = computedAt.toISOString();

        dbManager.db.transaction(() => {
            // No prior rows at all means a first computation (import, or backfill
            // after this table was added), not a recompute: seed it silently
            // rather than announcing the user's whole back-catalogue at once.
            const hadPriorState = (dbManager.db.prepare(`
                SELECT 1 FROM automaticAchievementState WHERE userId = :userId LIMIT 1
            `).get({ userId }) as unknown) !== undefined;

            const previouslyUnlockedRows = dbManager.db.prepare(`
                SELECT code, scope
                FROM automaticAchievementState
                WHERE userId = :userId AND unlockedAt IS NOT NULL
            `).all({ userId }) as Array<{ code: string, scope: string }>;

            const previouslyUnlocked = new Set(
                previouslyUnlockedRows.map(r => `${r.code}::${r.scope}`)
            );

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

            const newlyUnlocked = hadPriorState
                ? states.filter(s => s.unlockedAt !== null && !previouslyUnlocked.has(`${s.code}::${s.scope}`))
                : [];

            this.insertUnlockNotifications(newlyUnlocked, isoComputed);
        })();
    }

    replaceAllStatesTransactionally(states: ComputedAchievementState[], computedAt: Date): void {
        const isoComputed = computedAt.toISOString();

        dbManager.db.transaction(() => {
            // Per user, not globally: a brand-new player stays silent while a
            // genuine unlock still notifies everyone else.
            const priorStateUserRows = dbManager.db.prepare(`
                SELECT DISTINCT userId FROM automaticAchievementState
            `).all() as Array<{ userId: number }>;

            const usersWithPriorState = new Set(priorStateUserRows.map(r => r.userId));

            const previouslyUnlockedRows = dbManager.db.prepare(`
                SELECT userId, code, scope
                FROM automaticAchievementState
                WHERE unlockedAt IS NOT NULL
            `).all() as Array<{ userId: number, code: string, scope: string }>;

            const previouslyUnlocked = new Set(
                previouslyUnlockedRows.map(r => `${r.userId}::${r.code}::${r.scope}`)
            );

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

            const newlyUnlocked = states.filter(s =>
                usersWithPriorState.has(s.userId) &&
                s.unlockedAt !== null &&
                !previouslyUnlocked.has(`${s.userId}::${s.code}::${s.scope}`)
            );

            this.insertUnlockNotifications(newlyUnlocked, isoComputed);
        })();
    }

    fetchEvaluatorGames(userIds?: number[]): EvaluatorGame[] {
        let gameRows: Array<{
            id: number;
            clubId: number | null;
            eventId: number;
            gameSize: number;
            startedAt: string | null;
            endedAt: string | null;
            createdAt: string;
            startingDie1: number | null;
            startingDie2: number | null;
        }> = [];

        if (userIds !== undefined && userIds.length > 0) {
            const validUserIds = Array.from(new Set(userIds.filter(id => id !== 0)));
            if (validUserIds.length === 0) return [];

            const userChunks = chunkArray(validUserIds, 500);
            const gameIdSet = new Set<number>();
            for (const chunk of userChunks) {
                const placeholders = chunk.map(() => '?').join(',');
                const rows = dbManager.db.prepare(`
                    SELECT DISTINCT gameId FROM userToGame WHERE userId IN (${placeholders})
                `).all(...chunk) as Array<{ gameId: number }>;
                for (const r of rows) gameIdSet.add(r.gameId);
            }

            const matchedGameIds = Array.from(gameIdSet);
            if (matchedGameIds.length === 0) return [];

            const gameChunks = chunkArray(matchedGameIds, 500);
            for (const chunk of gameChunks) {
                const placeholders = chunk.map(() => '?').join(',');
                const rows = dbManager.db.prepare(`
                    SELECT
                        g.id,
                        e.clubId,
                        g.eventId,
                        gr.numberOfPlayers AS gameSize,
                        g.startedAt,
                        g.endedAt,
                        g.createdAt,
                        g.startingDie1,
                        g.startingDie2
                    FROM game g
                    JOIN event e ON e.id = g.eventId
                    JOIN gameRules gr ON gr.id = e.gameRules
                    WHERE g.status = 'FINISHED' AND g.id IN (${placeholders})
                `).all(...chunk) as typeof gameRows;
                gameRows.push(...rows);
            }
        } else {
            gameRows = dbManager.db.prepare(`
                SELECT
                    g.id,
                    e.clubId,
                    g.eventId,
                    gr.numberOfPlayers AS gameSize,
                    g.startedAt,
                    g.endedAt,
                    g.createdAt,
                    g.startingDie1,
                    g.startingDie2
                FROM game g
                JOIN event e ON e.id = g.eventId
                JOIN gameRules gr ON gr.id = e.gameRules
                WHERE g.status = 'FINISHED'
            `).all() as typeof gameRows;
        }

        if (gameRows.length === 0) return [];

        gameRows.sort((a, b) => {
            const dateA = new Date(a.endedAt ?? a.createdAt).getTime();
            const dateB = new Date(b.endedAt ?? b.createdAt).getTime();
            if (dateA !== dateB) return dateA - dateB;
            return a.id - b.id;
        });

        const gameIds = gameRows.map(g => g.id);
        const gameChunks = chunkArray(gameIds, 500);

        const playerRows: Array<{
            gameId: number;
            userId: number;
            points: number;
            startPlace: string | null;
            isSubstitutePlayer: number;
            isFillerPlayer: number;
        }> = [];

        const roundRows: Array<{
            gameId: number;
            roundNumber: number;
            wind: string;
            dealerNumber: number;
            counters: number;
            riichiSticks: number;
            result: string;
        }> = [];

        for (const chunk of gameChunks) {
            const placeholders = chunk.map(() => '?').join(',');
            const pRows = dbManager.db.prepare(`
                SELECT
                    utg.gameId,
                    utg.userId,
                    utg.points,
                    utg.startPlace,
                    utg.isSubstitutePlayer,
                    COALESCE(er.isFillerPlayer, 0) AS isFillerPlayer
                FROM userToGame utg
                JOIN game g ON g.id = utg.gameId
                LEFT JOIN eventRegistration er ON er.eventId = g.eventId AND er.userId = utg.userId
                WHERE utg.gameId IN (${placeholders})
            `).all(...chunk) as typeof playerRows;
            playerRows.push(...pRows);

            const rRows = dbManager.db.prepare(`
                SELECT
                    gameId,
                    roundNumber,
                    wind,
                    dealerNumber,
                    counters,
                    riichiSticks,
                    result
                FROM gameRound
                WHERE gameId IN (${placeholders})
                ORDER BY gameId ASC, roundNumber ASC
            `).all(...chunk) as typeof roundRows;
            roundRows.push(...rRows);
        }

        const playersByGame = new Map<number, EvaluatorGamePlayer[]>();
        for (const p of playerRows) {
            let list = playersByGame.get(p.gameId);
            if (list === undefined) {
                list = [];
                playersByGame.set(p.gameId, list);
            }
            list.push({
                userId: p.userId,
                points: p.points,
                startPlace: p.startPlace as Wind | null,
                isSubstitutePlayer: Boolean(p.isSubstitutePlayer),
                isFillerPlayer: Boolean(p.isFillerPlayer),
            });
        }

        const roundsByGame = new Map<number, EvaluatorGameRound[]>();
        for (const r of roundRows) {
            let list = roundsByGame.get(r.gameId);
            if (list === undefined) {
                list = [];
                roundsByGame.set(r.gameId, list);
            }
            list.push({
                roundNumber: r.roundNumber,
                wind: r.wind as Wind,
                dealerNumber: r.dealerNumber,
                counters: r.counters,
                riichiSticks: r.riichiSticks,
                result: JSON.parse(r.result) as GameRoundResult,
            });
        }

        return gameRows.map(g => {
            const endedAt = new Date(g.endedAt ?? g.createdAt);
            const startedAt = new Date(g.startedAt ?? g.createdAt);
            return {
                id: g.id,
                clubId: g.clubId ?? 0,
                eventId: g.eventId,
                gameSize: g.gameSize as 3 | 4,
                startedAt,
                endedAt,
                players: playersByGame.get(g.id) ?? [],
                rounds: roundsByGame.get(g.id) ?? [],
                startingDie1: g.startingDie1,
                startingDie2: g.startingDie2,
            };
        });
    }

    fetchEvaluatorEvents(userIds?: number[], clubFilter?: number): EvaluatorEventPlacement[] {
        let eventRows: Array<{
            id: number;
            clubId: number | null;
            type: string;
            dateTo: string | null;
            tournamentStatus: string | null;
        }> = [];

        if (userIds !== undefined && userIds.length > 0) {
            const validUserIds = Array.from(new Set(userIds.filter(id => id !== 0)));
            if (validUserIds.length === 0) return [];

            const userChunks = chunkArray(validUserIds, 500);
            const eventIdSet = new Set<number>();
            for (const chunk of userChunks) {
                const placeholders = chunk.map(() => '?').join(',');
                const regEvents = dbManager.db.prepare(`
                    SELECT DISTINCT eventId FROM eventRegistration WHERE userId IN (${placeholders})
                `).all(...chunk) as Array<{ eventId: number }>;
                for (const r of regEvents) eventIdSet.add(r.eventId);

                const gameEvents = dbManager.db.prepare(`
                    SELECT DISTINCT g.eventId
                    FROM game g
                    JOIN userToGame utg ON utg.gameId = g.id
                    WHERE utg.userId IN (${placeholders})
                `).all(...chunk) as Array<{ eventId: number }>;
                for (const r of gameEvents) eventIdSet.add(r.eventId);
            }

            const matchedEventIds = Array.from(eventIdSet);
            if (matchedEventIds.length === 0) return [];

            const eventChunks = chunkArray(matchedEventIds, 500);
            for (const chunk of eventChunks) {
                const placeholders = chunk.map(() => '?').join(',');
                let sql = `
                    SELECT e.id, e.clubId, e.type, e.dateTo, t.status AS tournamentStatus
                    FROM event e
                    LEFT JOIN tournament t ON t.eventId = e.id
                    WHERE (e.dateTo IS NOT NULL OR (e.type = 'TOURNAMENT' AND t.status = 'FINISHED'))
                      AND e.id IN (${placeholders})
                `;
                const params: any[] = [...chunk];
                if (clubFilter !== undefined) {
                    sql += ` AND e.clubId = ?`;
                    params.push(clubFilter);
                }
                const rows = dbManager.db.prepare(sql).all(...params) as typeof eventRows;
                eventRows.push(...rows);
            }
        } else {
            let sql = `
                SELECT e.id, e.clubId, e.type, e.dateTo, t.status AS tournamentStatus
                FROM event e
                LEFT JOIN tournament t ON t.eventId = e.id
                WHERE e.dateTo IS NOT NULL OR (e.type = 'TOURNAMENT' AND t.status = 'FINISHED')
            `;
            const params: any[] = [];
            if (clubFilter !== undefined) {
                sql += ` AND e.clubId = ?`;
                params.push(clubFilter);
            }
            eventRows = dbManager.db.prepare(sql).all(...params) as typeof eventRows;
        }

        const now = new Date();
        const evaluatorEvents: EvaluatorEventPlacement[] = [];
        const ratingService = new RatingService();

        for (const e of eventRows) {
            try {
                const dateTo = e.dateTo ? new Date(e.dateTo) : now;
                const isTournamentFinished = e.type === 'TOURNAMENT' && e.tournamentStatus === 'FINISHED';
                if (!isTournamentFinished && dateTo > now) continue;

                const standings = ratingService.calculateStandings(e.id);
                if (standings.size === 0) continue;

                const sortedStandings = [...standings.entries()].sort((a, b) => a[1] - b[1]);

                const registrations = dbManager.db.prepare(`
                    SELECT userId, isFillerPlayer
                    FROM eventRegistration
                    WHERE eventId = ?
                `).all(e.id) as Array<{ userId: number, isFillerPlayer: number }>;

                const fillerUsers = new Set(registrations.filter(r => r.isFillerPlayer).map(r => r.userId));

                const placements = sortedStandings.map(([userId, standing]) => ({
                    userId,
                    place: standing,
                    isEligible: userId !== 0 && !fillerUsers.has(userId),
                }));

                evaluatorEvents.push({
                    eventId: e.id,
                    clubId: e.clubId ?? 0,
                    isSeason: e.type === 'SEASON',
                    dateTo,
                    isFinished: true,
                    placements,
                });
            } catch (err: any) {
                // Skip invalid event data safely
            }
        }

        return evaluatorEvents;
    }

    fetchEvaluatorSkillResults(userIds?: number[], clubFilter?: number): EvaluatorSkillGameResult[] {
        let rows: Array<{
            gameId: number;
            userId: number;
            clubId: number;
            gameSize: number;
            rank: number;
            muBefore: number;
            sigmaBefore: number;
            muAfter: number;
            sigmaAfter: number;
            playedAt: string;
        }> = [];

        if (userIds !== undefined && userIds.length > 0) {
            const validUserIds = Array.from(new Set(userIds.filter(id => id !== 0)));
            if (validUserIds.length === 0) return [];

            // The skill achievements replay whole (clubId, gameSize) tracks:
            // another player's game can move the leaderboard the subject is
            // measured against. Fetch every game of every scope the users
            // touched, not just the games they played in, so a per-user
            // recompute always reaches the same answer as a full recompute.
            const userChunks = chunkArray(validUserIds, 500);
            const scopeSet = new Set<string>();
            for (const chunk of userChunks) {
                const placeholders = chunk.map(() => '?').join(',');
                const scopeRows = dbManager.db.prepare(`
                    SELECT DISTINCT clubId, gameSize FROM skillRatingGame WHERE userId IN (${placeholders})
                `).all(...chunk) as Array<{ clubId: number, gameSize: number }>;
                for (const r of scopeRows) scopeSet.add(`${r.clubId}:${r.gameSize}`);
            }

            const scopes = Array.from(scopeSet);
            if (scopes.length === 0) return [];

            const scopeChunks = chunkArray(scopes, 250);
            for (const chunk of scopeChunks) {
                const scopeClauses = chunk.map(() => `(clubId = ? AND gameSize = ?)`).join(' OR ');
                let sql = `
                    SELECT gameId, userId, clubId, gameSize, rank, muBefore, sigmaBefore, muAfter, sigmaAfter, playedAt
                    FROM skillRatingGame
                    WHERE (${scopeClauses})
                `;
                const params: any[] = chunk.flatMap(scope => {
                    const [clubId, gameSize] = scope.split(':');
                    return [Number(clubId), Number(gameSize)];
                });
                if (clubFilter !== undefined) {
                    sql += ` AND clubId = ?`;
                    params.push(clubFilter);
                }
                sql += ` ORDER BY playedAt ASC, gameId ASC`;
                rows.push(...dbManager.db.prepare(sql).all(...params) as typeof rows);
            }
        } else {
            let sql = `
                SELECT gameId, userId, clubId, gameSize, rank, muBefore, sigmaBefore, muAfter, sigmaAfter, playedAt
                FROM skillRatingGame
            `;
            const params: any[] = [];
            if (clubFilter !== undefined) {
                sql += ` WHERE clubId = ?`;
                params.push(clubFilter);
            }
            sql += ` ORDER BY playedAt ASC, gameId ASC`;
            rows = dbManager.db.prepare(sql).all(...params) as typeof rows;
        }

        const grouped = new Map<string, {
            clubId: number;
            gameSize: 3 | 4;
            gameId: number;
            timestamp: Date;
            userSnapshots: EvaluatorSkillUserSnapshot[];
        }>();

        for (const r of rows) {
            const key = `${r.clubId}:${r.gameSize}:${r.gameId}`;
            let item = grouped.get(key);
            if (item === undefined) {
                item = {
                    clubId: r.clubId,
                    gameSize: r.gameSize as 3 | 4,
                    gameId: r.gameId,
                    timestamp: new Date(r.playedAt),
                    userSnapshots: [],
                };
                grouped.set(key, item);
            }
            item.userSnapshots.push({
                userId: r.userId,
                initialMu: r.muBefore,
                initialSigma: r.sigmaBefore,
                // The DISPLAY rating the player actually sees (1500-based, scaled),
                // not the raw OpenSkill ordinal (~27). The achievement targets are
                // written in display points - 1600/2200 peaks, a 50-point one-game
                // swing - so comparing a raw ordinal against them made every one of
                // these unreachable: the largest ordinal gain in the whole database
                // is 4.95 against a target of 50.
                initialDisplayRating: toDisplaySkill(r.muBefore, r.sigmaBefore),
                finalMu: r.muAfter,
                finalSigma: r.sigmaAfter,
                finalDisplayRating: toDisplaySkill(r.muAfter, r.sigmaAfter),
                place: r.rank,
            });
        }

        return Array.from(grouped.values());
    }

    hasUserPlayedGameSize(userId: number, gameSize: 3 | 4): boolean {
        const row = dbManager.db.prepare(`
            SELECT 1
            FROM userToGame utg
            JOIN game g ON g.id = utg.gameId
            JOIN event e ON e.id = g.eventId
            JOIN gameRules gr ON gr.id = e.gameRules
            WHERE utg.userId = ? AND gr.numberOfPlayers = ? AND g.status = 'FINISHED'
            LIMIT 1
        `).get(userId, gameSize);
        return row !== undefined;
    }

    hasUserPlayedTrackedGame(userId: number): boolean {
        const row = dbManager.db.prepare(`
            SELECT 1
            FROM userToGame utg
            JOIN gameRound grnd ON grnd.gameId = utg.gameId
            WHERE utg.userId = ?
            LIMIT 1
        `).get(userId);
        return row !== undefined;
    }
}
