import { dbManager } from '../db/dbInit.ts';
import { AutomaticAchievementRepository } from '../repository/AutomaticAchievementRepository.ts';
import {
    evaluateAutomaticAchievements,
    type EvaluatorEventPlacement,
    type EvaluatorGame,
    type EvaluatorGamePlayer,
    type EvaluatorGameRound,
    type EvaluatorSkillGameResult,
    type EvaluatorSkillUserSnapshot,
} from '../util/AutomaticAchievementEvaluator.ts';
import { Wind } from '../model/GameModels.ts';
import type { GameRoundResult } from '../model/GameRoundResultModels.ts';
import LogService from './LogService.ts';
import { RatingService } from './RatingService.ts';

export class AutomaticAchievementService {
    private achievementRepository: AutomaticAchievementRepository = new AutomaticAchievementRepository();
    private ratingService: RatingService = new RatingService();

    recomputeAll(computedAt: Date = new Date()): void {
        try {
            const games = this.fetchEvaluatorGames();
            const eventPlacements = this.fetchEvaluatorEvents();
            const skillResults = this.fetchEvaluatorSkillResults();

            const states = evaluateAutomaticAchievements(games, eventPlacements, skillResults);
            const sanitized = this.sanitizeStates(states);
            this.achievementRepository.replaceAllStatesTransactionally(sanitized, computedAt);
        } catch (err: any) {
            LogService.logError('Failed to recompute automatic achievements:', err);
        }
    }

    recomputeUsers(userIds: number[], computedAt: Date = new Date()): void {
        const uniqueUserIds = Array.from(new Set(userIds.filter(id => id !== 0)));
        if (uniqueUserIds.length === 0) return;

        try {
            const games = this.fetchEvaluatorGames();
            const eventPlacements = this.fetchEvaluatorEvents();
            const skillResults = this.fetchEvaluatorSkillResults();

            const allStates = evaluateAutomaticAchievements(games, eventPlacements, skillResults);
            const sanitizedAll = this.sanitizeStates(allStates);

            dbManager.db.transaction(() => {
                for (const uid of uniqueUserIds) {
                    const uStates = sanitizedAll.filter(s => s.userId === uid);
                    this.achievementRepository.replaceUserStatesTransactionally(uid, uStates, computedAt);
                }
            })();
        } catch (err: any) {
            LogService.logError(
                `Failed to recompute automatic achievements for users [${uniqueUserIds.join(', ')}]:`,
                err
            );
        }
    }

    recomputeUser(userId: number, computedAt: Date = new Date()): void {
        this.recomputeUsers([userId], computedAt);
    }

    recomputeClub(clubId: number, computedAt: Date = new Date()): void {
        try {
            const games = this.fetchEvaluatorGames();
            const clubUserIds = new Set<number>();
            for (const g of games) {
                if (g.clubId === clubId) {
                    for (const p of g.players) {
                        if (p.userId !== 0) clubUserIds.add(p.userId);
                    }
                }
            }
            this.recomputeUsers(Array.from(clubUserIds), computedAt);
        } catch (err: any) {
            LogService.logError(`Failed to recompute automatic achievements for club ${clubId}:`, err);
        }
    }

    private sanitizeStates(states: any[]): any[] {
        const userRows = dbManager.db.prepare('SELECT id FROM user').all() as Array<{ id: number }>;
        const eventRows = dbManager.db.prepare('SELECT id FROM event').all() as Array<{ id: number }>;
        const gameRows = dbManager.db.prepare('SELECT id FROM game').all() as Array<{ id: number }>;

        const validUserIds = new Set(userRows.map(u => u.id));
        const validEventIds = new Set(eventRows.map(e => e.id));
        const validGameIds = new Set(gameRows.map(g => g.id));

        return states
            .filter(s => validUserIds.has(s.userId))
            .map(s => ({
                ...s,
                sourceEventId: s.sourceEventId !== null && validEventIds.has(s.sourceEventId) ? s.sourceEventId : null,
                sourceGameId: s.sourceGameId !== null && validGameIds.has(s.sourceGameId) ? s.sourceGameId : null,
            }));
    }

    fetchEvaluatorGames(): EvaluatorGame[] {
        const gameRows = dbManager.db.prepare(`
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
            ORDER BY g.endedAt ASC, g.id ASC
        `).all() as Array<{
            id: number;
            clubId: number | null;
            eventId: number;
            gameSize: number;
            startedAt: string | null;
            endedAt: string | null;
            createdAt: string;
            startingDie1: number | null;
            startingDie2: number | null;
        }>;

        if (gameRows.length === 0) return [];

        const gameIds = gameRows.map(g => g.id);
        const placeholders = gameIds.map(() => '?').join(',');

        const playerRows = dbManager.db.prepare(`
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
        `).all(...gameIds) as Array<{
            gameId: number;
            userId: number;
            points: number;
            startPlace: string | null;
            isSubstitutePlayer: number;
            isFillerPlayer: number;
        }>;

        const roundRows = dbManager.db.prepare(`
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
        `).all(...gameIds) as Array<{
            gameId: number;
            roundNumber: number;
            wind: string;
            dealerNumber: number;
            counters: number;
            riichiSticks: number;
            result: string;
        }>;

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

    private fetchEvaluatorEvents(clubFilter?: number): EvaluatorEventPlacement[] {
        let sql = `
            SELECT id, clubId, type, dateTo
            FROM event
            WHERE dateTo IS NOT NULL
        `;
        const params: any[] = [];
        if (clubFilter !== undefined) {
            sql += ` AND clubId = ?`;
            params.push(clubFilter);
        }

        const eventRows = dbManager.db.prepare(sql).all(...params) as Array<{
            id: number;
            clubId: number | null;
            type: string;
            dateTo: string;
        }>;

        const now = new Date();
        const evaluatorEvents: EvaluatorEventPlacement[] = [];

        for (const e of eventRows) {
            try {
                const dateTo = new Date(e.dateTo);
                if (dateTo > now) continue; // dateTo must have passed

                const standings = this.ratingService.calculateStandings(e.id);
                if (standings.size === 0) continue;

                const sortedStandings = [...standings.entries()].sort((a, b) => b[1] - a[1]);

                // Check eligibility per user
                const registrations = dbManager.db.prepare(`
                    SELECT userId, isFillerPlayer
                    FROM eventRegistration
                    WHERE eventId = ?
                `).all(e.id) as Array<{ userId: number, isFillerPlayer: number }>;

                const fillerUsers = new Set(registrations.filter(r => r.isFillerPlayer).map(r => r.userId));

                const placements = sortedStandings.map(([userId], idx) => ({
                    userId,
                    place: idx + 1,
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
                // Skip invalid test event data safely
            }
        }

        return evaluatorEvents;
    }

    private fetchEvaluatorSkillResults(clubFilter?: number): EvaluatorSkillGameResult[] {
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

        const rows = dbManager.db.prepare(sql).all(...params) as Array<{
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
        }>;

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
