import { IncorrectPlayerCountError } from '../error/GameErrors.ts';
import { SelectedRulesetHasNoDetailedRulesError } from '../error/PointCalculationErrors.ts';
import type { GameState } from '../model/GameModels.ts';
import type { GameRoundResult, GameRoundResultInputDTO } from '../model/GameRoundResultModels.ts';
import { GameRulesService } from './GameRulesService.ts';
import { calculateGameRoundResult } from '../util/PointCalculationUtil.ts';
import { buildSyntheticGame, type SyntheticGamePlayerInput } from '../util/SyntheticGameUtil.ts';

export interface ScoreLocalGameRoundPreviewParams {
    gameRulesId: number;
    players: SyntheticGamePlayerInput[];
    currentState: GameState;
    result: GameRoundResultInputDTO;
}

export class LocalGameScoringService {
    private gameRulesService: GameRulesService = new GameRulesService();

    scoreRoundPreview(params: ScoreLocalGameRoundPreviewParams): GameRoundResult {
        const { gameRulesId, players, currentState, result } = params;
        const gameRules = this.gameRulesService.getGameRulesById(gameRulesId);

        if (players.length !== gameRules.numberOfPlayers) {
            throw new IncorrectPlayerCountError(gameRules.numberOfPlayers);
        }

        // Legacy rulesets can have a NULL details column. calculateGameRoundResult
        // would throw a 500 for those; here the id is client-supplied, so reject
        // it as bad input instead.
        if (gameRules.details === null) {
            throw new SelectedRulesetHasNoDetailedRulesError();
        }

        const syntheticGame = buildSyntheticGame(players, currentState);
        return calculateGameRoundResult(syntheticGame, gameRules, result);
    }
}
