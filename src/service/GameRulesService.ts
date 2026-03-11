import { GameRulesRepository } from '../repository/GameRulesRepository.ts';
import { GameRulesNotFoundError } from '../error/EventErrors.ts';
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
}
