import { booleanToInteger } from "../db/dbUtils.ts";
import { PleaseProvideStartPlaceForAllPlayersToResolveTie, UserRatingChangeInGameNotFound } from "../error/RatingErrors.ts";
import type { GameRules, UmaTieBreak } from "../model/EventModels.ts";
import type { GameWithPlayers, PlayerData, StartPlace } from "../model/GameModels.ts";
import type { RatingSnapshot, UserRating, UserRatingChange, UserRatingChangeShortDTO, UserRatingWithPlace } from "../model/RatingModels.ts";
import { RatingRepository } from "../repository/RatingRepository.ts";
import { EventService } from "./EventService.ts";
import { UserService } from "./UserService.ts";

export class RatingService {

    private ratingRepository: RatingRepository = new RatingRepository();
    private userService: UserService = new UserService();
    private eventService: EventService = new EventService();

    getAllUsersCurrentRating(eventId: number): UserRatingWithPlace[] {
        this.eventService.validateEventExists(eventId);
        const userRatings = this.ratingRepository.findAllUsersCurrentRating(eventId)
            .map(normalizeUserRating);
        const standingsMap = this.calculateStandingsMap(userRatings);

        const result = userRatings.map(ur => ({
            ...ur,
            place: standingsMap.get(ur.user.id) ?? null
        }));
        result.sort((a, b) =>
            (booleanToInteger(b.minimumGamesPlayed) - booleanToInteger(a.minimumGamesPlayed))
            || (b.rating - a.rating)
            || (a.user.name.localeCompare(b.user.name))
        );
        return result;
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
        gameRules: GameRules,
        startingRating: number
    ): void {
        const players = [...playersData];
        this.sortPlayersData(players, gameRules.umaTieBreak);
        const uma = this.calculateUma(players, gameRules);

        for (const [index, playerData] of players.entries()) {
            const latestRatingChange = this.ratingRepository.findUserLatestRatingChangeBeforeDate(
                playerData.userId, eventId, gameTimestamp
            );
            const currentRating = latestRatingChange?.rating ?? startingRating * RATING_TO_POINTS_COEFFICIENT;

            const gainedPoints = playerData.points - gameRules.startingPoints;
            const ratingChange = gainedPoints
                + uma[index]! * RATING_TO_POINTS_COEFFICIENT
                - (gameRules.chomboPointsAfterUma ?? 0) * (playerData.chomboCount ?? 0);
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

    private sortPlayersData(playersData: PlayerData[], umaTieBreak: UmaTieBreak) {
        if (umaTieBreak === 'WIND') {
            if (new Set(playersData.map(p => p.points)).size < playersData.length) {
                this.validatePlayersDataHasStartPlace(playersData);
            }
            playersData.sort((a, b) => b.points - a.points || WIND_ORDER[a.startPlace!] - WIND_ORDER[b.startPlace!]);
        } else {
            playersData.sort((a, b) => b.points - a.points);
        }
    }

    private validatePlayersDataHasStartPlace(playersData: PlayerData[]): void {
        if (playersData.some(p => !p.startPlace)) {
            throw new PleaseProvideStartPlaceForAllPlayersToResolveTie();
        }
    }

    private calculateUma(players: PlayerData[], gameRules: GameRules): number[] {
        const playerPoints = players.map(p => p.points);
        let uma = this.resolveDynamicUma(playerPoints, gameRules);
        if (gameRules.umaTieBreak === 'DIVIDE') {
            uma = this.averageUma(uma, playerPoints, gameRules);
        }
        return uma;
    }

    private averageUma(uma: number[], playerPoints: number[], gameRules: GameRules): number[] {
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


    calculateStandings(eventId: number): Map<number, number> {
        const userRatings = this.ratingRepository.findAllUsersCurrentRating(eventId)
        return this.calculateStandingsMap(userRatings);
    }

    /**
     * Calculate standings for users in an event based on their ratings.
     * Users with the same rating share the same standing.
     * Only users who have played at least the minimum number of games are considered.
     * @returns Map from userId to standing (1-indexed)
     */
    private calculateStandingsMap(userRatings: UserRating[]): Map<number, number> {
        const ratings = userRatings.filter(ur => ur.minimumGamesPlayed);

        // Sort by rating descending
        ratings.sort((a, b) => b.rating - a.rating);

        const standingsMap = new Map<number, number>();
        let currentStanding = 1;
        let previousRating: number | null = null;

        for (let i = 0; i < ratings.length; i++) {
            const userRating = ratings[i]!;

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

export const RATING_TO_POINTS_COEFFICIENT: number = 1000;

const WIND_ORDER: Record<StartPlace, number> = {
    EAST: 0, SOUTH: 1, WEST: 2, NORTH: 3
};

function normalizeUserRating(userRating: UserRating): UserRating {
    return { ...userRating, rating: userRating.rating / RATING_TO_POINTS_COEFFICIENT };
}

function normalizeUserRatingChange(userRatingChange: UserRatingChangeShortDTO): UserRatingChangeShortDTO {
    return { ...userRatingChange, ratingChange: userRatingChange.ratingChange / RATING_TO_POINTS_COEFFICIENT };
}

function normalizeRatingSnapshot(ratingSnapshot: RatingSnapshot): RatingSnapshot {
    return { ...ratingSnapshot, rating: ratingSnapshot.rating / RATING_TO_POINTS_COEFFICIENT };
}