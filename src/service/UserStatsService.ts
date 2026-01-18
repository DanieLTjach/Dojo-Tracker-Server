import type { UserEventStats, GameStatsData } from '../model/UserStatsModels.ts';
import { UserStatsRepository } from '../repository/UserStatsRepository.ts';
import { EventRepository } from '../repository/EventRepository.ts';
import { UserRepository } from '../repository/UserRepository.ts';
import { UserNotFoundById } from '../error/UserErrors.ts';
import { EventNotFoundError } from '../error/EventErrors.ts';

export class UserStatsService {
    private userStatsRepository: UserStatsRepository = new UserStatsRepository();
    private eventRepository: EventRepository = new EventRepository();
    private userRepository: UserRepository = new UserRepository();

    getUserEventStats(userId: number, eventId: number): UserEventStats {
        // Validate user and event exist
        const user = this.userRepository.findUserById(userId);
        if (!user) {
            throw new UserNotFoundById(userId);
        }

        const event = this.eventRepository.findEventById(eventId);
        if (!event) {
            throw new EventNotFoundError(eventId);
        }

        // Get game stats data
        const gameStats = this.userStatsRepository.getUserGameStats(userId, eventId);
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

        // If user hasn't played any games, return default stats
        if (gamesPlayed === 0) {
            return {
                userId,
                eventId,
                place: userRank,
                playerRating: currentRating || startingRating,
                gamesPlayed: 0,
                averageIncrement: 0,
                averagePlace: 0,
                percentageFirstPlace: 0,
                percentageSecondPlace: 0,
                percentageThirdPlace: 0,
                percentageFourthPlace: 0,
                percentageOfNegativeRank: 0,
                percentageOfGamesPlayedFromAll: 0,
                sumOfPoints: 0,
                amountOfRatingEarned: 0,
                maxPoints: 0,
                minPoints: 0,
                averagePoints: 0,
            };
        }

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
        const percentageOfNegativeRank = (negativeScoreCount / gamesPlayed) * 100;
        const percentageOfGamesPlayedFromAll = totalGamesInEvent > 0 ? (gamesPlayed / totalGamesInEvent) * 100 : 0;
        const averagePlace = totalPlacement / gamesPlayed;

        return {
            userId,
            eventId,
            place: userRank,
            playerRating: finalRating,
            gamesPlayed,
            averageIncrement: parseFloat(averageIncrement.toFixed(2)),
            averagePlace: parseFloat(averagePlace.toFixed(2)),
            percentageFirstPlace: parseFloat(percentageFirstPlace.toFixed(2)),
            percentageSecondPlace: parseFloat(percentageSecondPlace.toFixed(2)),
            percentageThirdPlace: parseFloat(percentageThirdPlace.toFixed(2)),
            percentageFourthPlace: parseFloat(percentageFourthPlace.toFixed(2)),
            percentageOfNegativeRank: parseFloat(percentageOfNegativeRank.toFixed(2)),
            percentageOfGamesPlayedFromAll: parseFloat(percentageOfGamesPlayedFromAll.toFixed(2)),
            sumOfPoints,
            amountOfRatingEarned: parseFloat(totalRatingChange.toFixed(2)),
            maxPoints,
            minPoints,
            averagePoints: parseFloat(averagePoints.toFixed(2)),
        };
    }
}
