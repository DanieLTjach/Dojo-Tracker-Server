import { UserRatingChangeInGameNotFound } from "../error/RatingErrors.ts";
import type { GameRules } from "../model/EventModels.ts";
import type { GamePlayer, GameWithPlayers, PlayerData } from "../model/GameModels.ts";
import type { RatingSnapshot, UserRating, UserRatingChange, UserRatingChangeShortDTO } from "../model/RatingModels.ts";
import { RatingRepository } from "../repository/RatingRepository.ts";
import { EventService } from "./EventService.ts";
import { UserService } from "./UserService.ts";

export class RatingService {

    private ratingRepository: RatingRepository = new RatingRepository();
    private userService: UserService = new UserService();
    private eventService: EventService = new EventService();

    getAllUsersCurrentRating(eventId: number): UserRating[] {
        this.eventService.validateEventExists(eventId);
        return this.ratingRepository.findAllUsersCurrentRating(eventId)
            .map(normalizeUserRating);
    }

    getAllUsersTotalRatingChangeDuringPeriod(
        eventId: number,
        dateFrom: Date,
        dateTo: Date
    ): UserRatingChangeShortDTO[] {
        this.eventService.validateEventExists(eventId);
        return this.ratingRepository.getAllUsersTotalRatingChangeDuringPeriod(eventId, dateFrom, dateTo)
            .map(normalizeUserRatingChange);
    }

    getUserRatingHistory(
        userId: number,
        eventId: number
    ): RatingSnapshot[] {
        this.userService.validateUserExistsById(userId);
        this.eventService.validateEventExists(eventId);
        return this.ratingRepository.getUserRatingHistory(userId, eventId)
            .map(normalizeRatingSnapshot);
    }

    addRatingChangesFromGame(
        gameId: number,
        gameTimestamp: Date,
        playersData: PlayerData[],
        eventId: number,
        gameRules: GameRules
    ): void {
        const players = [...playersData];
        players.sort((a, b) => b.points - a.points);
        const umaWithTieBreaking = this.calculateUmaWithAveraging(players.map(p => p.points), gameRules);

        for (const [index, playerData] of players.entries()) {
            const latestRatingChange = this.ratingRepository.findUserLatestRatingChangeBeforeDate(
                playerData.userId, eventId, gameTimestamp
            );
            const currentRating = latestRatingChange?.rating ?? gameRules.startingRating * RATING_TO_POINTS_COEFFICIENT;

            const gainedPoints = playerData.points - gameRules.startingPoints;
            const ratingChange = gainedPoints + umaWithTieBreaking[index]! * RATING_TO_POINTS_COEFFICIENT;
            const newRating = currentRating + ratingChange;

            this.ratingRepository.addUserRatingChange({
                userId: playerData.userId,
                eventId: eventId,
                gameId: gameId,
                ratingChange,
                rating: newRating,
                timestamp: gameTimestamp
            });
            this.ratingRepository.updateUserRatingChangesAfterDate(
                playerData.userId,
                eventId,
                ratingChange,
                gameTimestamp
            );
        }
    }

    deleteRatingChangesFromGame(game: GameWithPlayers) {
        for (const player of game.players) {
            const userRatingChange = this.findUserRatingChangeInGameOrThrow(player.userId, game.id);
            this.ratingRepository.updateUserRatingChangesAfterDate(
                player.userId,
                game.eventId,
                -userRatingChange.ratingChange,
                game.createdAt
            );
        }
        this.ratingRepository.deleteRatingChangesFromGame(game.id);
    }

    private findUserRatingChangeInGameOrThrow(userId: number, gameId: number): UserRatingChange {
        const userRatingChange = this.ratingRepository.findUserRatingChangeInGame(userId, gameId);
        if (userRatingChange === undefined) {
            throw new UserRatingChangeInGameNotFound(userId, gameId);
        }
        return userRatingChange;
    }

    private calculateUmaWithAveraging(playerPoints: number[], gameRules: GameRules): number[] {
        const uma = this.resolveDynamicUma(playerPoints, gameRules);

        const pointsToIndices = new Map();
        for (const [index, points] of playerPoints.entries()) {
            if (!pointsToIndices.has(points)) {
                pointsToIndices.set(points, [index]);
            } else {
                pointsToIndices.get(points).push(index);
            }
        }

        const newUma = new Array(gameRules.numberOfPlayers);
        for (const indicesWithTheSamePoints of pointsToIndices.values()) {
            let sum = 0;
            for (const index of indicesWithTheSamePoints) {
                sum += uma[index]!;
            }
            const averageUma = sum / indicesWithTheSamePoints.length;
            for (const index of indicesWithTheSamePoints) {
                newUma[index] = averageUma;
            }
        }

        return newUma;
    }

    private resolveDynamicUma(playerPoints: number[], gameRules: GameRules): number[] {
        if (!Array.isArray(gameRules.uma[0])) {
            return gameRules.uma as number[];
        }

        const nonNegativePointsCount = playerPoints.filter(points => points >= gameRules.startingPoints).length;

        if (nonNegativePointsCount === gameRules.numberOfPlayers) {
            return new Array(gameRules.numberOfPlayers).fill(0);
        }

        return (gameRules.uma as number[][])[nonNegativePointsCount - 1]!;
    }

    /**
     * Calculate standings for users in an event based on their ratings.
     * Users with the same rating share the same standing.
     * @returns Map from userId to standing (1-indexed)
     */
    calculateStandings(eventId: number): Map<number, number> {
        const userRatings = this.ratingRepository.findAllUsersCurrentRating(eventId);
        
        // Sort by rating descending
        userRatings.sort((a, b) => b.rating - a.rating);
        
        const standingsMap = new Map<number, number>();
        let currentStanding = 1;
        let previousRating: number | null = null;
        
        for (let i = 0; i < userRatings.length; i++) {
            const userRating = userRatings[i]!;
            
            // If rating is different from previous, update standing
            if (previousRating !== null && userRating.rating !== previousRating) {
                currentStanding = i + 1;
            }
            
            standingsMap.set(userRating.user.id, currentStanding);
            previousRating = userRating.rating;
        }
        
        return standingsMap;
    }
}

const RATING_TO_POINTS_COEFFICIENT: number = 1000;

function normalizeUserRating(userRating: UserRating): UserRating {
    return { ...userRating, rating: userRating.rating / RATING_TO_POINTS_COEFFICIENT };
}

function normalizeUserRatingChange(userRatingChange: UserRatingChangeShortDTO): UserRatingChangeShortDTO {
    return { ...userRatingChange, ratingChange: userRatingChange.ratingChange / RATING_TO_POINTS_COEFFICIENT };
}

function normalizeRatingSnapshot(ratingSnapshot: RatingSnapshot): RatingSnapshot {
    return { ...ratingSnapshot, rating: ratingSnapshot.rating / RATING_TO_POINTS_COEFFICIENT };
}

export function normalizeRatingChange(gamePlayer: GamePlayer): GamePlayer {
    return {
        ...gamePlayer,
        ratingChange: gamePlayer.ratingChange / RATING_TO_POINTS_COEFFICIENT
    };
}