import { GameRulesRepository } from '../repository/GameRulesRepository.ts';
import { GameRulesNotFoundError, CannotDeleteGameRulesInUseError, CannotUpdateGameRulesInUseError } from '../error/GameRulesErrors.ts';
import type { GameRules } from '../model/EventModels.ts';

export class GameRulesService {
    private gameRulesRepository: GameRulesRepository;

    constructor() {
        this.gameRulesRepository = new GameRulesRepository();
    }

    getAllGameRules(): GameRules[] {
        return this.gameRulesRepository.findAllGameRules();
    }

    getGameRulesById(id: number): GameRules {
        const gameRules = this.gameRulesRepository.findGameRulesById(id);
        if (!gameRules) {
            throw new GameRulesNotFoundError(id);
        }
        return gameRules;
    }

    createGameRules(data: GameRulesCreateData): GameRules {
        const params = {
            name: data.name,
            numberOfPlayers: data.numberOfPlayers,
            uma: JSON.stringify(data.uma),
            startingPoints: data.startingPoints,
            startingRating: data.startingRating
        };

        const newId = this.gameRulesRepository.createGameRules(params);
        return this.getGameRulesById(newId);
    }

    updateGameRules(id: number, data: GameRulesUpdateData): GameRules {
        // Check if game rules exist
        const existingGameRules = this.gameRulesRepository.findGameRulesById(id);
        if (!existingGameRules) {
            throw new GameRulesNotFoundError(id);
        }

        // Check if game rules are used by events with games
        if (this.gameRulesRepository.isGameRulesUsedByEventsWithGames(id)) {
            throw new CannotUpdateGameRulesInUseError(id);
        }

        const params: Record<string, string | number | undefined> = {};
        if (data.name !== undefined) params['name'] = data.name;
        if (data.numberOfPlayers !== undefined) params['numberOfPlayers'] = data.numberOfPlayers;
        if (data.uma !== undefined) params['uma'] = JSON.stringify(data.uma);
        if (data.startingPoints !== undefined) params['startingPoints'] = data.startingPoints;
        if (data.startingRating !== undefined) params['startingRating'] = data.startingRating;

        this.gameRulesRepository.updateGameRules(id, params as any);
        return this.getGameRulesById(id);
    }

    deleteGameRules(id: number): void {
        // Check if game rules exist
        const existingGameRules = this.gameRulesRepository.findGameRulesById(id);
        if (!existingGameRules) {
            throw new GameRulesNotFoundError(id);
        }

        // Check if game rules are used by events with games
        if (this.gameRulesRepository.isGameRulesUsedByEventsWithGames(id)) {
            throw new CannotDeleteGameRulesInUseError(id);
        }

        this.gameRulesRepository.deleteGameRules(id);
    }
}

export interface GameRulesCreateData {
    name: string;
    numberOfPlayers: number;
    uma: number[] | number[][];
    startingPoints: number;
    startingRating: number;
}

export interface GameRulesUpdateData {
    name?: string | undefined;
    numberOfPlayers?: number | undefined;
    uma?: number[] | number[][] | undefined;
    startingPoints?: number | undefined;
    startingRating?: number | undefined;
}
