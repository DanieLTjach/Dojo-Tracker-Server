import { GameRepository } from '../repository/GameRepository.ts';
import { UserService } from '../service/UserService.ts';
import { 
    GameNotFoundById,
    IncorrectPlayerCountError,
    DuplicatePlayerError,
    TooManyGamesFoundError
} from '../error/GameErrors.ts';
import type { GameWithPlayers, PlayerData, GameFilters } from '../model/GameModels.ts';
import { EventService } from './EventService.ts';

export class GameService {

    private gameRepository: GameRepository = new GameRepository();
    private userService: UserService = new UserService();
    private eventService: EventService = new EventService();

    createGame(
        eventId: number,
        playersData: PlayerData[],
        createdBy: number
    ): GameWithPlayers {
        this.userService.validateUserIsActiveById(createdBy);

        this.eventService.validateEventExists(eventId);
        this.validatePlayers(playersData);

        const newGameId = this.gameRepository.createGame(eventId, createdBy);
        this.addPlayersToGame(newGameId, playersData, createdBy);

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
        modifiedBy: number
    ): GameWithPlayers {
        this.userService.validateUserIsAdmin(modifiedBy);

        this.validateGameExists(gameId);
        this.eventService.validateEventExists(eventId);
        this.validatePlayers(playersData);

        this.gameRepository.updateGame(gameId, eventId, modifiedBy);
        this.gameRepository.deleteGamePlayersByGameId(gameId);
        this.addPlayersToGame(gameId, playersData, modifiedBy);
        
        return this.getGameById(gameId);
    }

    deleteGame(gameId: number, deletedBy: number): void {
        this.userService.validateUserIsAdmin(deletedBy);

        this.validateGameExists(gameId);

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

    private validateGameExists(gameId: number): void {
        const game = this.gameRepository.findGameById(gameId);
        if (!game) {
            throw new GameNotFoundById(gameId);
        }
    }

    private validatePlayers(playersData: PlayerData[]): void {
        // TODO: add validation based on event rules
        const requiredPlayersCount = 4;
        if (playersData.length !== requiredPlayersCount) {
            throw new IncorrectPlayerCountError(requiredPlayersCount);
        }
        
        for (const playerData of playersData) {
            this.userService.validateUserIsActiveById(playerData.userId);
        }

        this.validateNoDuplicatePlayers(playersData);
    }

    private addPlayersToGame(gameId: number, players: PlayerData[], modifiedBy: number): void {
        for (const player of players) {
            this.gameRepository.addGamePlayer(
                gameId,
                player.userId,
                player.points,
                player.startPlace,
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
}
