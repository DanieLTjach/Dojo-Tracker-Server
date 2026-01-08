import { GameRepository } from '../repository/GameRepository.ts';
import { UserService } from '../service/UserService.ts';
import {
    GameNotFoundById,
    IncorrectPlayerCountError,
    DuplicatePlayerError,
    TooManyGamesFoundError,
} from '../error/GameErrors.ts';
import type { GameWithPlayers, PlayerData, GameFilters } from '../model/GameModels.ts';
import { EventService } from './EventService.ts';
import type { GameRules } from '../model/EventModels.ts';
import { RatingService } from './RatingService.ts';

export class GameService {
    private gameRepository: GameRepository = new GameRepository();
    private userService: UserService = new UserService();
    private eventService: EventService = new EventService();
    private ratingService: RatingService = new RatingService();

    addGame(eventId: number, playersData: PlayerData[], createdBy: number): GameWithPlayers {
        const timestamp = new Date();
        this.userService.validateUserIsActiveById(createdBy);

        this.eventService.validateEventExists(eventId);
        const gameRules = this.eventService.getGameRulesByEventId(eventId);
        this.validatePlayers(playersData, gameRules);

        const newGameId = this.gameRepository.createGame(eventId, createdBy, timestamp);
        this.addPlayersToGame(newGameId, playersData, createdBy);

        const newGame = this.getGameById(newGameId);
        this.ratingService.addRatingChangesFromGame(newGame, gameRules);
        return newGame;
    }

    getGameById(gameId: number): GameWithPlayers {
        const game = this.gameRepository.findGameById(gameId);
        if (!game) {
            throw new GameNotFoundById(gameId);
        }

        return {
            ...game,
            players: this.gameRepository.findGamePlayersByGameId(gameId),
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
            players: gamePlayers.filter(gp => gp.gameId === game.id),
        }));
    }

    updateGame(gameId: number, eventId: number, playersData: PlayerData[], modifiedBy: number): GameWithPlayers {
        this.userService.validateUserIsAdmin(modifiedBy);

        const game = this.getGameById(gameId);
        this.eventService.validateEventExists(eventId);
        const gameRules = this.eventService.getGameRulesByEventId(eventId);
        this.validatePlayers(playersData, gameRules);

        this.gameRepository.updateGame(gameId, eventId, modifiedBy);
        this.gameRepository.deleteGamePlayersByGameId(gameId);
        this.addPlayersToGame(gameId, playersData, modifiedBy);

        this.ratingService.deleteRatingChangesFromGame(game);
        const newGame = this.getGameById(gameId);
        this.ratingService.addRatingChangesFromGame(newGame, gameRules);
        return newGame;
    }

    deleteGame(gameId: number, deletedBy: number): void {
        this.userService.validateUserIsAdmin(deletedBy);

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
    }

    private addPlayersToGame(gameId: number, players: PlayerData[], modifiedBy: number): void {
        for (const player of players) {
            this.gameRepository.addGamePlayer(gameId, player.userId, player.points, player.startPlace, modifiedBy);
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
}
