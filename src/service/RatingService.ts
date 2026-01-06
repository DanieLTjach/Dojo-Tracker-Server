import { UserRatingChangeInGameNotFound } from "../error/RatingErrors.ts";
import type { GameRules } from "../model/EventModels.ts";
import type { GameWithPlayers } from "../model/GameModels.ts";
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
        game: GameWithPlayers,
        gameRules: GameRules
    ): void {
        const players = [...game.players];
        players.sort((a, b) => b.points - a.points);
        const umaWithTieBreaking = this.calculateUmaWithAveraging(players.map(p => p.points), gameRules.uma);

        for (const [index, playerData] of players.entries()) {
            const latestRatingChange = this.ratingRepository.findUserLatestRatingChangeBeforeDate(
                playerData.userId, game.eventId, game.createdAt
            );
            const currentRating = latestRatingChange?.rating ?? gameRules.startingRating * RATING_TO_POINTS_COEFFICIENT;

            const gainedPoints = playerData.points - gameRules.startingPoints;
            const ratingChange = gainedPoints + umaWithTieBreaking[index]! * RATING_TO_POINTS_COEFFICIENT;
            const newRating = currentRating + ratingChange;

            this.ratingRepository.addUserRatingChange({
                userId: playerData.userId,
                eventId: game.eventId,
                gameId: game.id,
                ratingChange,
                rating: newRating,
                timestamp: game.createdAt
            });
            this.ratingRepository.updateUserRatingChangesAfterDate(
                playerData.userId,
                game.eventId,
                ratingChange,
                game.createdAt
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

    private calculateUmaWithAveraging(playerPoints: number[], uma: number[]): number[] {
        const pointsToIndices = new Map();
        for (const [index, points] of playerPoints.entries()) {
            if (!pointsToIndices.has(points)) {
                pointsToIndices.set(points, [index]);
            } else {
                pointsToIndices.get(points).push(index);
            }
        }

        const newUma = []
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