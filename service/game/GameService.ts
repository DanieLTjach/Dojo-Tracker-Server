import { GameRepository } from './GameRepository.ts';
import { UserService } from '../user/UserService.ts';
import { GameNotFoundById, IncorrectPlayerCountError, DuplicatePlayerError, EventNotFoundError, TooManyGamesFoundError } from './GameErrors.ts';
import type { GameWithPlayers, PlayerData, GameFilters, ResolvedPlayerData } from './GameModels.ts';

export class GameService {
    private gameRepository: GameRepository;
    private userService: UserService;

    constructor() {
        this.gameRepository = new GameRepository();
        this.userService = new UserService();
    }

    async createGame(
        eventId: number,
        playersData: PlayerData[],
        createdBy: number
    ): Promise<GameWithPlayers> {
        await this.userService.validateUserIsAdmin(createdBy);

        await this.validateEventExists(eventId);
        const resolvedPlayersData = await this.validateAndResolvePlayers(playersData);

        const gameId = await this.gameRepository.createGame(eventId, createdBy);
        await this.addPlayersToGame(gameId, resolvedPlayersData, createdBy);

        return await this.getGameById(gameId);
    }

    async getGameById(gameId: number): Promise<GameWithPlayers> {
        const game = await this.gameRepository.findGameById(gameId);
        if (!game) {
            throw new GameNotFoundById(gameId);
        }

        return {
            ...game,
            players: await this.gameRepository.findGamePlayersByGameId(gameId)
        };
    }

    async getGames(filters: GameFilters): Promise<GameWithPlayers[]> {
        await this.validateGameFilters(filters);

        const games = await this.gameRepository.findGames(filters);

        if (games.length > 100) {
            throw new TooManyGamesFoundError();
        }

        const gamePlayers = await this.gameRepository.findGamePlayersByGameIds(games.map(g => g.id));

        return games.map(game => ({
            ...game,
            players: gamePlayers.filter(gp => gp.game_id === game.id)
        }));
    }

    async updateGame(
        gameId: number,
        eventId: number,
        playersData: PlayerData[],
        modifiedBy: number
    ): Promise<GameWithPlayers> {
        await this.userService.validateUserIsAdmin(modifiedBy);

        await this.validateGameExists(gameId);
        await this.validateEventExists(eventId);
        const resolvedPlayersData = await this.validateAndResolvePlayers(playersData);

        await this.gameRepository.updateGame(gameId, eventId, modifiedBy);
        await this.gameRepository.deleteGamePlayersByGameId(gameId);
        await this.addPlayersToGame(gameId, resolvedPlayersData, modifiedBy);

        return await this.getGameById(gameId);
    }

    async deleteGame(gameId: number, deletedBy: number): Promise<void> {
        await this.userService.validateUserIsAdmin(deletedBy);

        await this.validateGameExists(gameId);

        await this.gameRepository.deleteGamePlayersByGameId(gameId);
        await this.gameRepository.deleteGameById(gameId);
    }

    private async validateGameFilters(filters: GameFilters): Promise<void> {
        if (filters?.userId !== undefined) {
            await this.userService.validateUserExistsById(filters.userId);
        }
        if (filters?.eventId !== undefined) {
            await this.validateEventExists(filters.eventId);
        }
    }

    private async validateGameExists(gameId: number): Promise<void> {
        const game = await this.gameRepository.findGameById(gameId);
        if (!game) {
            throw new GameNotFoundById(gameId);
        }
    }

    private async validateEventExists(eventId: number): Promise<void> {
        const event = await this.gameRepository.findEventById(eventId);
        if (!event) {
            throw new EventNotFoundError(eventId);
        }
    }

    private async validateAndResolvePlayers(playersData: PlayerData[]): Promise<ResolvedPlayerData[]> {
        // TODO: add validation based on event rules
        const requiredPlayersCount = 4;
        if (playersData.length !== requiredPlayersCount) {
            throw new IncorrectPlayerCountError(requiredPlayersCount);
        }

        const resolvedPlayersData = await this.resolvePlayersData(playersData);
        this.validateNoDuplicatePlayers(resolvedPlayersData);

        return resolvedPlayersData;
    }

    private async resolvePlayersData(playersData: PlayerData[]): Promise<ResolvedPlayerData[]> {
        const resolvedPlayersData: ResolvedPlayerData[] = [];

        for (const playerData of playersData) {
            resolvedPlayersData.push({
                user: await this.userService.resolveUser(playerData.user),
                points: playerData.points,
                startPlace: playerData.startPlace
            });
        }

        return resolvedPlayersData;
    }

    private async addPlayersToGame(gameId: number, resolvedPlayers: ResolvedPlayerData[], modifiedBy: number): Promise<void> {
        for (const resolvedPlayer of resolvedPlayers) {
            await this.gameRepository.addGamePlayer(
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
