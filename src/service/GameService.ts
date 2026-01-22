import { GameRepository } from '../repository/GameRepository.ts';
import { UserService } from '../service/UserService.ts';
import {
    GameNotFoundById,
    IncorrectPlayerCountError,
    DuplicatePlayerError,
    TooManyGamesFoundError,
    IncorrectTotalPointsError,
    EventHasntStartedError,
    EventHasEndedError,
    DuplicateGameTimestampInEventError,
    YouHaveToBeAdminToCreateGameWithCustomTime
} from '../error/GameErrors.ts';
import type { GameWithPlayers, PlayerData, GameFilters } from '../model/GameModels.ts';
import { EventService } from './EventService.ts';
import type { Event, GameRules } from '../model/EventModels.ts';
import { RatingService } from './RatingService.ts';

export class GameService {

    private gameRepository: GameRepository = new GameRepository();
    private userService: UserService = new UserService();
    private eventService: EventService = new EventService();
    private ratingService: RatingService = new RatingService();

    addGame(
        eventId: number,
        playersData: PlayerData[],
        createdBy: number,
        createdAt: Date | undefined
    ): GameWithPlayers {
        const gameTimestamp = createdAt ?? new Date();
        if (createdAt !== undefined) {
            this.userService.validateUserIsAdmin(createdBy, () => new YouHaveToBeAdminToCreateGameWithCustomTime());
        }

        const event = this.eventService.getEventById(eventId);
        this.validatePlayers(playersData, event.gameRules);
        this.validateGameWithinEventDates(event, gameTimestamp);
        this.validateNoDuplicateGameTimestamp(eventId, gameTimestamp);

        const newGameId = this.gameRepository.createGame(eventId, createdBy, gameTimestamp);
        this.addPlayersToGame(newGameId, playersData, createdBy);
        this.ratingService.addRatingChangesFromGame(newGameId, gameTimestamp, playersData, eventId, event.gameRules);

        return this.getGameById(newGameId);
    }

    getGameById(gameId: number): GameWithPlayers {
        const game = this.gameRepository.findGameById(gameId);
        if (!game) {
            throw new GameNotFoundById(gameId);
        }

        return {
            ...game,
            players: this.gameRepository.findGamePlayersByGameId(gameId)
        };
    }

    getGames(filters: GameFilters): GameWithPlayers[] {
        this.validateGameFilters(filters);

        const games = this.gameRepository.findGames(filters);

        if (games.length > 100) {
            throw new TooManyGamesFoundError();
        }

        const gamePlayers = this.gameRepository.findGamePlayersByGameIds(games.map(g => g.id));

        return games.map(game => ({
            ...game,
            players: gamePlayers.filter(gp => gp.gameId === game.id)
        }));
    }

    updateGame(
        gameId: number,
        eventId: number,
        playersData: PlayerData[],
        modifiedBy: number,
        createdAt: Date | undefined
    ): GameWithPlayers {
        const game = this.getGameById(gameId);
        const event = this.eventService.getEventById(eventId);
        this.validatePlayers(playersData, event.gameRules);

        const newGameTimestamp = createdAt ?? game.createdAt;

        this.gameRepository.updateGame(gameId, eventId, modifiedBy, newGameTimestamp);
        this.gameRepository.deleteGamePlayersByGameId(gameId);
        this.addPlayersToGame(gameId, playersData, modifiedBy);

        this.ratingService.deleteRatingChangesFromGame(game);
        this.ratingService.addRatingChangesFromGame(gameId, newGameTimestamp, playersData, eventId, event.gameRules);

        return this.getGameById(gameId);
    }

    deleteGame(gameId: number): void {
        const game = this.getGameById(gameId);
        this.ratingService.deleteRatingChangesFromGame(game);

        this.gameRepository.deleteGamePlayersByGameId(gameId);
        this.gameRepository.deleteGameById(gameId);
    }

    private validateGameFilters(filters: GameFilters): void {
        if (filters?.userId !== undefined) {
            this.userService.validateUserExistsById(filters.userId);
        }
        if (filters?.eventId !== undefined) {
            this.eventService.validateEventExists(filters.eventId);
        }
    }

    private validatePlayers(playersData: PlayerData[], gameRules: GameRules): void {
        if (playersData.length !== gameRules.numberOfPlayers) {
            throw new IncorrectPlayerCountError(gameRules.numberOfPlayers);
        }

        for (const playerData of playersData) {
            this.userService.validateUserIsActiveById(playerData.userId);
        }

        this.validateNoDuplicatePlayers(playersData);
        this.validateTotalPoints(playersData, gameRules);
    }

    private addPlayersToGame(gameId: number, players: PlayerData[], modifiedBy: number): void {
        for (const player of players) {
            this.gameRepository.addGamePlayer(
                gameId,
                player.userId,
                player.points,
                player.startPlace ?? undefined,
                modifiedBy
            );
        }
    }

    private validateNoDuplicatePlayers(players: PlayerData[]): void {
        const userIds = players.map(p => p.userId);
        const uniqueUserIds = new Set(userIds);

        if (uniqueUserIds.size !== userIds.length) {
            const seen = new Set<number>();
            for (const player of players) {
                if (seen.has(player.userId)) {
                    throw new DuplicatePlayerError(player.userId);
                }
                seen.add(player.userId);
            }
        }
    }

    private validateTotalPoints(playersData: PlayerData[], gameRules: GameRules): void {
        const totalPoints = playersData.reduce((sum, player) => sum + player.points, 0);
        const expectedTotal = gameRules.numberOfPlayers * gameRules.startingPoints;
        
        if (totalPoints !== expectedTotal) {
            throw new IncorrectTotalPointsError(expectedTotal, totalPoints);
        }
    }

    private validateGameWithinEventDates(event: Event, gameTimestamp: Date): void {
        if (event.dateFrom !== null && gameTimestamp < event.dateFrom) {
            throw new EventHasntStartedError(event.name);
        }
        if (event.dateTo !== null && gameTimestamp > event.dateTo) {
            throw new EventHasEndedError(event.name);
        }
    }

    // rating calculation relies on unique game timestamps within an event
    private validateNoDuplicateGameTimestamp(eventId: number, timestamp: Date): void {
        const existingGame = this.gameRepository.findGameByEventAndTimestamp(eventId, timestamp);
        if (existingGame !== undefined) {
            throw new DuplicateGameTimestampInEventError();
        }
    }
}
