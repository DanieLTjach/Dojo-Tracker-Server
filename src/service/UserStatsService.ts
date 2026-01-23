import type { UserEventStats, GameStatsData } from '../model/UserStatsModels.ts';
import { UserStatsRepository } from '../repository/UserStatsRepository.ts';
import { UserService } from './UserService.ts';
import { EventService } from './EventService.ts';

export class UserStatsService {
    private userStatsRepository: UserStatsRepository = new UserStatsRepository();
    private userService: UserService = new UserService();
    private eventService: EventService = new EventService();

    getUserEventStats(userId: number, eventId: number): UserEventStats | null {
        // Validate user and event exist (services throw if not found)
        this.userService.getUserById(userId);
        const event = this.eventService.getEventById(eventId);

        // Get game stats data
        const gameStats = this.userStatsRepository.getUserGameStats(userId, eventId);

        // Return null if user didn't participate in the event
        if (gameStats.length === 0) {
            return null;
        }

        const currentRating = this.userStatsRepository.getUserCurrentRating(userId, eventId);
        const totalGamesInEvent = this.userStatsRepository.getTotalGamesInEvent(eventId);
        const userRank = this.userStatsRepository.getUserRankInEvent(userId, eventId);

        // Get starting rating from game rules
        const startingRating = event.gameRules.startingRating;

        // Calculate all stats
        return this.calculateStats(userId, eventId, gameStats, currentRating, startingRating, totalGamesInEvent, userRank);
    }

    private calculateStats(
        userId: number,
        eventId: number,
        gameStats: GameStatsData[],
        currentRating: number | undefined,
        startingRating: number,
        totalGamesInEvent: number,
        userRank: number
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
        const averageIncrement = totalRatingChange / gamesPlayed;
        const finalRating = currentRating || startingRating;

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
            eventId,
            place: userRank,
            playerRating: finalRating,
            gamesPlayed,
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
