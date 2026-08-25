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

            const userChunks = chunkArray(validUserIds, 500);
            const gameIdSet = new Set<number>();
            for (const chunk of userChunks) {
                const placeholders = chunk.map(() => '?').join(',');
                const gRows = dbManager.db.prepare(`
                    SELECT DISTINCT gameId FROM skillRatingGame WHERE userId IN (${placeholders})
                `).all(...chunk) as Array<{ gameId: number }>;
                for (const r of gRows) gameIdSet.add(r.gameId);
            }

            const matchedGameIds = Array.from(gameIdSet);
            if (matchedGameIds.length === 0) return [];

            const gameChunks = chunkArray(matchedGameIds, 500);
            for (const chunk of gameChunks) {
                const placeholders = chunk.map(() => '?').join(',');
                let sql = `
                    SELECT gameId, userId, clubId, gameSize, rank, muBefore, sigmaBefore, muAfter, sigmaAfter, playedAt
                    FROM skillRatingGame
                    WHERE gameId IN (${placeholders})
                `;
                const params: any[] = [...chunk];
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
                initialDisplayRating: r.muBefore - 3 * r.sigmaBefore,
                finalMu: r.muAfter,
                finalSigma: r.sigmaAfter,
                finalDisplayRating: r.muAfter - 3 * r.sigmaAfter,
                place: r.rank,
            });
        }

        return Array.from(grouped.values());
    }
}
