import { GameRepository } from '../repository/GameRepository.ts';
import { UserService } from '../service/UserService.ts';
import { 
    GameNotFoundById,
    IncorrectPlayerCountError,
    DuplicatePlayerError,
    TooManyGamesFoundError
} from '../error/GameErrors.ts';
import type { GameWithPlayers, PlayerData, GameFilters, ResolvedPlayerData } from '../model/GameModels.ts';
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
        const resolvedPlayersData = this.validateAndResolvePlayers(playersData);

        const newGameId = this.gameRepository.createGame(eventId, createdBy);
        this.addPlayersToGame(newGameId, resolvedPlayersData, createdBy);

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
        const resolvedPlayersData = this.validateAndResolvePlayers(playersData);

        this.gameRepository.updateGame(gameId, eventId, modifiedBy);
        this.gameRepository.deleteGamePlayersByGameId(gameId);
        this.addPlayersToGame(gameId, resolvedPlayersData, modifiedBy);

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

    private validateAndResolvePlayers(playersData: PlayerData[]): ResolvedPlayerData[] {
        // TODO: add validation based on event rules
        const requiredPlayersCount = 4;
        if (playersData.length !== requiredPlayersCount) {
            throw new IncorrectPlayerCountError(requiredPlayersCount);
        }

        const resolvedPlayersData = this.resolvePlayersData(playersData);
        this.validateNoDuplicatePlayers(resolvedPlayersData);

        return resolvedPlayersData;
    }

    private resolvePlayersData(playersData: PlayerData[]): ResolvedPlayerData[] {
        const resolvedPlayersData: ResolvedPlayerData[] = [];

        for (const playerData of playersData) {
            resolvedPlayersData.push({
                user: this.userService.resolveActiveUser(playerData.user),
                points: playerData.points,
                startPlace: playerData.startPlace
            });
        }

        return resolvedPlayersData;
    }

    private addPlayersToGame(gameId: number, resolvedPlayers: ResolvedPlayerData[], modifiedBy: number): void {
        for (const resolvedPlayer of resolvedPlayers) {
            this.gameRepository.addGamePlayer(
                gameId,
                resolvedPlayer.user.id,
                resolvedPlayer.points,
                resolvedPlayer.startPlace,
                modifiedBy
            );
        }
    }

    private validateNoDuplicatePlayers(resolvedPlayers: ResolvedPlayerData[]): void {
        const userIds = resolvedPlayers.map(p => p.user.id);
        const uniqueUserIds = new Set(userIds);

        if (uniqueUserIds.size !== userIds.length) {
            const seen = new Map<number, ResolvedPlayerData>();
            for (const player of resolvedPlayers) {
                if (seen.has(player.user.id)) {
                    const identifier = player.user.telegramUsername || player.user.name || `with ID ${player.user.id}`;
                    throw new DuplicatePlayerError(identifier);
                }
                seen.set(player.user.id, player);
            }
        }
    }
}
