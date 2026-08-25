import { dbManager } from '../db/dbInit.ts';
import { AutomaticAchievementRepository } from '../repository/AutomaticAchievementRepository.ts';
import {
    evaluateAutomaticAchievements,
    type EvaluatorEventPlacement,
    type EvaluatorGame,
    type EvaluatorSkillGameResult,
} from '../util/AutomaticAchievementEvaluator.ts';

export class AutomaticAchievementService {
    private achievementRepository: AutomaticAchievementRepository = new AutomaticAchievementRepository();

    recomputeAll(computedAt: Date = new Date()): void {
        const games = this.achievementRepository.fetchEvaluatorGames();
        const eventPlacements = this.achievementRepository.fetchEvaluatorEvents();
        const skillResults = this.achievementRepository.fetchEvaluatorSkillResults();

        const states = evaluateAutomaticAchievements(games, eventPlacements, skillResults);
        this.achievementRepository.replaceAllStatesTransactionally(states, computedAt);
    }

    recomputeUsers(userIds: number[], computedAt: Date = new Date()): void {
        const uniqueUserIds = Array.from(new Set(userIds.filter(id => id !== 0)));
        if (uniqueUserIds.length === 0) return;

        const games = this.achievementRepository.fetchEvaluatorGames(uniqueUserIds);
        const eventPlacements = this.achievementRepository.fetchEvaluatorEvents(uniqueUserIds);
        const skillResults = this.achievementRepository.fetchEvaluatorSkillResults(uniqueUserIds);

        const allStates = evaluateAutomaticAchievements(games, eventPlacements, skillResults);

        dbManager.db.transaction(() => {
            for (const uid of uniqueUserIds) {
                const uStates = allStates.filter(s => s.userId === uid);
                this.achievementRepository.replaceUserStatesTransactionally(uid, uStates, computedAt);
            }
        })();
    }

    recomputeUser(userId: number, computedAt: Date = new Date()): void {
        this.recomputeUsers([userId], computedAt);
    }

    recomputeClub(clubId: number, computedAt: Date = new Date()): void {
        const clubUserIds = new Set<number>();
        const memberRows = dbManager.db.prepare(`
            SELECT DISTINCT userId FROM clubMembership WHERE clubId = ?
            UNION
            SELECT DISTINCT utg.userId
            FROM userToGame utg
            JOIN game g ON g.id = utg.gameId
            JOIN event e ON e.id = g.eventId
            WHERE e.clubId = ?
        `).all(clubId, clubId) as Array<{ userId: number }>;

        for (const m of memberRows) {
            if (m.userId !== 0) clubUserIds.add(m.userId);
        }

        this.recomputeUsers(Array.from(clubUserIds), computedAt);
    }

    fetchEvaluatorGames(userIds?: number[]): EvaluatorGame[] {
        return this.achievementRepository.fetchEvaluatorGames(userIds);
    }

    fetchEvaluatorEvents(userIds?: number[], clubFilter?: number): EvaluatorEventPlacement[] {
        return this.achievementRepository.fetchEvaluatorEvents(userIds, clubFilter);
    }

    fetchEvaluatorSkillResults(userIds?: number[], clubFilter?: number): EvaluatorSkillGameResult[] {
        return this.achievementRepository.fetchEvaluatorSkillResults(userIds, clubFilter);
    }
}
