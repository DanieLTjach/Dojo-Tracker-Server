import type { UserEventStats, GameStatsData } from '../model/UserStatsModels.ts';
import { UserStatsRepository } from '../repository/UserStatsRepository.ts';
import { UserService } from './UserService.ts';
import { EventService } from './EventService.ts';
import { UserHasNoRatingDespiteHavingPlayedGames } from '../error/RatingErrors.ts';
import { RATING_TO_POINTS_COEFFICIENT, RatingService } from './RatingService.ts';
import type { Event } from '../model/EventModels.ts';

export class UserStatsService {
    private userStatsRepository: UserStatsRepository = new UserStatsRepository();
    private userService: UserService = new UserService();
    private eventService: EventService = new EventService();
    private ratingService: RatingService = new RatingService();

    getUserEventStats(userId: number, eventId: number): UserEventStats | null {
        this.userService.getUserById(userId);
        const event = this.eventService.getEventById(eventId);

        // Get game stats data
        const gameStats = this.userStatsRepository.getUserGameStats(userId, eventId);

        // Return null if user didn't participate in the event
        if (gameStats.length === 0) {
            return null;
        }

        let playerRating = this.userStatsRepository.getUserCurrentRating(userId, eventId);
        if (playerRating === undefined) {
            throw new UserHasNoRatingDespiteHavingPlayedGames(userId, eventId);
        }
        playerRating /= RATING_TO_POINTS_COEFFICIENT;

        const totalGamesInEvent = this.userStatsRepository.getTotalGamesInEvent(eventId);
        const userRank = this.ratingService.calculateStandings(eventId).get(userId) ?? null;

        // Calculate all stats
        return this.calculateStats(userId, event, gameStats, playerRating, totalGamesInEvent, userRank);
    }

    private calculateStats(
        userId: number,
        event: Event,
        gameStats: GameStatsData[],
        playerRating: number,
        totalGamesInEvent: number,
        userRank: number | null
    ): UserEventStats {
        const gamesPlayed = gameStats.length;

        // Calculate placement stats
        const placementCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
        let totalPlacement = 0;
        let negativeScoreCount = 0;

        gameStats.forEach((game) => {
            totalPlacement += game.placement;
            if (game.placement in placementCounts) {
                placementCounts[game.placement as keyof typeof placementCounts]++;
            }
            if (game.points < 0) {
                negativeScoreCount++;
            }
        });

        // Calculate points stats
        const allPoints = gameStats.map((g) => g.points);
        const sumOfPoints = allPoints.reduce((sum, pts) => sum + pts, 0);
        const maxPoints = Math.max(...allPoints);
        const minPoints = Math.min(...allPoints);
        const averagePoints = sumOfPoints / gamesPlayed;

        // Calculate rating stats
        const totalRatingChange = gameStats.reduce((sum, g) => sum + g.ratingChange, 0);
        const averageIncrement = totalRatingChange / gamesPlayed / RATING_TO_POINTS_COEFFICIENT;

        // Calculate percentages
        const percentageFirstPlace = (placementCounts[1] / gamesPlayed) * 100;
        const percentageSecondPlace = (placementCounts[2] / gamesPlayed) * 100;
        const percentageThirdPlace = (placementCounts[3] / gamesPlayed) * 100;
        const percentageFourthPlace = (placementCounts[4] / gamesPlayed) * 100;
        const percentageOfNegativePoints = (negativeScoreCount / gamesPlayed) * 100;
        const percentageOfGamesPlayedFromAll = totalGamesInEvent > 0 ? (gamesPlayed / totalGamesInEvent) * 100 : 0;
        const averagePlace = totalPlacement / gamesPlayed;

        return {
            userId,
            eventId: event.id,
            place: userRank,
            playerRating,
            gamesPlayed,
            minimumGamesPlayed: gamesPlayed >= event.gameRules.minimumGamesForRating,
            remainingGamesToRating: Math.max(0, event.gameRules.minimumGamesForRating - gamesPlayed),
            averageIncrement,
            averagePlace,
            percentageFirstPlace,
            percentageSecondPlace,
            percentageThirdPlace,
            percentageFourthPlace,
            percentageOfNegativePoints,
            percentageOfGamesPlayedFromAll,
            sumOfPoints,
            maxPoints,
            minPoints,
            averagePoints,
        };
    }
}
