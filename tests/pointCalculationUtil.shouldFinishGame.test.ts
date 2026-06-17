import { describe, expect, it } from '@jest/globals';
import { gameRulesPresetsByKey } from '../src/data/gameRulesPresets.ts';
import type { GameRulesValues } from '../src/data/gameRulesCatalog.ts';
import { GameFinishReason, Wind } from '../src/model/GameModels.ts';
import type { GameRoundResultInputDTO } from '../src/model/GameRoundResultModels.ts';
import { shouldFinishGame } from '../src/util/PointCalculationUtil.ts';
import { fourPlayers, gameState, makeGameRules } from './pointCalculationUtil.helpers.ts';

const exhaustiveDraw: GameRoundResultInputDTO = {
    type: 'EXHAUSTIVE_DRAW',
    riichiPlayerIds: [],
    tenpaiPlayerIds: [],
    nagashiManganPlayerIds: [],
};

const tsumo: GameRoundResultInputDTO = {
    type: 'TSUMO',
    winningHandData: {
        winnerPlayerId: 1,
        yakumanCount: 0,
        han: 3,
        fu: 40,
    },
    riichiPlayerIds: [],
};

const ron: GameRoundResultInputDTO = {
    type: 'RON',
    dealInPlayerId: 2,
    winningHandData: [{
        winnerPlayerId: 1,
        yakumanCount: 0,
        han: 3,
        fu: 40,
    }],
    riichiPlayerIds: [],
};

describe('shouldFinishGame', () => {
    const mahjongSoulRules = gameRulesPresetsByKey.get('mahjong_soul')!.rules;
    const emaRules = gameRulesPresetsByKey.get('ema_2025')!.rules;

    describe('bankruptcy', () => {
        it('returns BANKRUPTCY when a player is below zero and bankrupt rule is below_zero', () => {
            const rules = { ...mahjongSoulRules };
            const players = fourPlayers([25000, 25000, -100, 25000]);

            expect(shouldFinishGame(
                gameState(Wind.SOUTH, 1),
                gameState(Wind.SOUTH, 2),
                players,
                makeGameRules(rules),
                rules,
                exhaustiveDraw
            )).toBe(GameFinishReason.BANKRUPTCY);
        });

        it('does not finish the game when a player has zero points and bankrupt rule is below_zero', () => {
            const rules = { ...mahjongSoulRules, bankrupt: 'below_zero' as const };
            const players = fourPlayers([25000, 0, 25000, 25000]);

            expect(shouldFinishGame(
                gameState(Wind.SOUTH, 1),
                gameState(Wind.SOUTH, 2),
                players,
                makeGameRules(rules),
                rules,
                exhaustiveDraw
            )).toBeUndefined();
        });

        it('returns BANKRUPTCY when a player has zero points and bankrupt rule is zero_or_less', () => {
            const rules = { ...mahjongSoulRules, bankrupt: 'zero_or_less' as const };
            const players = fourPlayers([25000, 0, 25000, 25000]);

            expect(shouldFinishGame(
                gameState(Wind.SOUTH, 1),
                gameState(Wind.SOUTH, 2),
                players,
                makeGameRules(rules),
                rules,
                exhaustiveDraw
            )).toBe(GameFinishReason.BANKRUPTCY);
        });

        it('does not finish the game when bankrupt rule is none', () => {
            const rules = { ...emaRules };
            const players = fourPlayers([25000, -1000, 25000, 25000]);

            expect(shouldFinishGame(
                gameState(Wind.SOUTH, 1),
                gameState(Wind.SOUTH, 2),
                players,
                makeGameRules(rules),
                rules,
                exhaustiveDraw
            )).toBeUndefined();
        });
    });

    describe('max points', () => {
        it('returns MAX_POINTS when a player reaches the configured cap', () => {
            const rules = { ...emaRules, max_points: 50000 };
            const players = fourPlayers([25000, 25000, 51000, 25000]);

            expect(shouldFinishGame(
                gameState(Wind.SOUTH, 1),
                gameState(Wind.SOUTH, 2),
                players,
                makeGameRules(rules),
                rules,
                exhaustiveDraw
            )).toBe(GameFinishReason.MAX_POINTS);
        });

        it('does not finish the game when max_points is not configured', () => {
            const rules = { ...emaRules };
            const players = fourPlayers([25000, 25000, 100000, 25000]);

            expect(shouldFinishGame(
                gameState(Wind.SOUTH, 1),
                gameState(Wind.SOUTH, 2),
                players,
                makeGameRules(rules),
                rules,
                exhaustiveDraw
            )).toBeUndefined();
        });
    });

    describe('continuing in east or south', () => {
        it('returns undefined when the next round is in the east round', () => {
            const rules = { ...emaRules };

            expect(shouldFinishGame(
                gameState(Wind.EAST, 1),
                gameState(Wind.EAST, 2),
                fourPlayers([25000, 25000, 25000, 25000]),
                makeGameRules(rules),
                rules,
                exhaustiveDraw
            )).toBeUndefined();
        });

        it('returns undefined when the next round is south but not all-last repeat', () => {
            const rules = { ...emaRules };

            expect(shouldFinishGame(
                gameState(Wind.SOUTH, 3),
                gameState(Wind.SOUTH, 4),
                fourPlayers([25000, 25000, 25000, 25000]),
                makeGameRules(rules),
                rules,
                exhaustiveDraw
            )).toBeUndefined();
        });
    });

    describe('all-last repeat (agari / tenpai yame)', () => {
        const allLastCurrent = gameState(Wind.SOUTH, 4);
        const allLastNext = gameState(Wind.SOUTH, 4);

        it('returns TENPAI_YAME on exhaustive draw when dealer is in 1st place and tenpai_yame is rank_1', () => {
            const rules = {
                ...mahjongSoulRules,
                tenpai_yame: 'rank_1' as const,
                automatic_agari_tenpai_yame: true,
            };
            const players = fourPlayers([21000, 24000, 25000, 30000]);

            expect(shouldFinishGame(
                allLastCurrent,
                allLastNext,
                players,
                makeGameRules(rules),
                rules,
                exhaustiveDraw
            )).toBe(GameFinishReason.TENPAI_YAME);
        });

        it('returns undefined on exhaustive draw when dealer is not in 1st place and tenpai_yame is rank_1', () => {
            const rules = {
                ...mahjongSoulRules,
                tenpai_yame: 'rank_1' as const,
                automatic_agari_tenpai_yame: true,
            };
            const players = fourPlayers([21000, 24000, 30000, 25000]);

            expect(shouldFinishGame(
                allLastCurrent,
                allLastNext,
                players,
                makeGameRules(rules),
                rules,
                exhaustiveDraw
            )).toBeUndefined();
        });

        it('returns undefined on exhaustive draw when tenpai_yame is disabled', () => {
            const rules = { ...mahjongSoulRules, tenpai_yame: 'no' as const };
            const players = fourPlayers([21000, 24000, 25000, 30000]);

            expect(shouldFinishGame(
                allLastCurrent,
                allLastNext,
                players,
                makeGameRules(rules),
                rules,
                exhaustiveDraw
            )).toBeUndefined();
        });

        it('returns AGARI_YAME on tsumo when dealer is in 1st place and agari_yame is rank_1', () => {
            const rules = { ...mahjongSoulRules };
            const players = fourPlayers([21000, 24000, 25000, 30000]);

            expect(shouldFinishGame(
                allLastCurrent,
                allLastNext,
                players,
                makeGameRules(rules),
                rules,
                tsumo
            )).toBe(GameFinishReason.AGARI_YAME);
        });

        it('returns undefined on tsumo when dealer is not in 1st place and agari_yame is rank_1', () => {
            const rules = { ...mahjongSoulRules };
            const players = fourPlayers([21000, 24000, 30000, 25000]);

            expect(shouldFinishGame(
                allLastCurrent,
                allLastNext,
                players,
                makeGameRules(rules),
                rules,
                tsumo
            )).toBeUndefined();
        });

        it('returns undefined on abortive draw during all-last repeat', () => {
            const rules = { ...mahjongSoulRules };
            const players = fourPlayers([21000, 24000, 25000, 30000]);

            expect(shouldFinishGame(
                allLastCurrent,
                allLastNext,
                players,
                makeGameRules(rules),
                rules,
                { type: 'ABORTIVE_DRAW', drawType: 'FOUR_RIICHI', riichiPlayerIds: [] }
            )).toBeUndefined();
        });
    });

    describe('north round', () => {
        it('returns REACHED_NORTH_ROUND when the next round would be north', () => {
            const rules = { ...mahjongSoulRules, west_round: false };

            expect(shouldFinishGame(
                gameState(Wind.SOUTH, 4),
                gameState(Wind.NORTH, 1),
                fourPlayers([25000, 25000, 25000, 25000]),
                makeGameRules(rules),
                rules,
                exhaustiveDraw
            )).toBe(GameFinishReason.REACHED_NORTH_ROUND);
        });
    });

    describe('west round', () => {
        it('returns PLAYED_ALL_ROUNDS when west round is disabled', () => {
            const rules = { ...emaRules, west_round: false };

            expect(shouldFinishGame(
                gameState(Wind.SOUTH, 4),
                gameState(Wind.WEST, 1),
                fourPlayers([25000, 25000, 25000, 25000]),
                makeGameRules(rules),
                rules,
                exhaustiveDraw
            )).toBe(GameFinishReason.PLAYED_ALL_ROUNDS);
        });

        it('returns PLAYED_ALL_ROUNDS when west round is enabled but goal is not set', () => {
            const rules: GameRulesValues = { ...emaRules, west_round: true };

            expect(shouldFinishGame(
                gameState(Wind.SOUTH, 4),
                gameState(Wind.WEST, 1),
                fourPlayers([25000, 25000, 25000, 25000]),
                makeGameRules(rules),
                rules,
                exhaustiveDraw
            )).toBe(GameFinishReason.PLAYED_ALL_ROUNDS);
        });

        it('returns PLAYED_ALL_ROUNDS when entering west from south and a player has reached the goal', () => {
            const rules = { ...mahjongSoulRules };

            expect(shouldFinishGame(
                gameState(Wind.SOUTH, 4),
                gameState(Wind.WEST, 1),
                fourPlayers([31000, 25000, 24000, 20000]),
                makeGameRules(rules),
                rules,
                exhaustiveDraw
            )).toBe(GameFinishReason.PLAYED_ALL_ROUNDS);
        });

        it('returns undefined when entering west from south and no player has reached the goal', () => {
            const rules = { ...mahjongSoulRules };

            expect(shouldFinishGame(
                gameState(Wind.SOUTH, 4),
                gameState(Wind.WEST, 1),
                fourPlayers([25000, 25000, 25000, 25000]),
                makeGameRules(rules),
                rules,
                exhaustiveDraw
            )).toBeUndefined();
        });

        it('returns GOAL_EXCEEDED_IN_WEST_ROUND when already in west, goal is met, and the round ended with a win', () => {
            const rules = { ...mahjongSoulRules };

            expect(shouldFinishGame(
                gameState(Wind.WEST, 2),
                gameState(Wind.WEST, 3),
                fourPlayers([31000, 25000, 24000, 20000]),
                makeGameRules(rules),
                rules,
                ron
            )).toBe(GameFinishReason.GOAL_EXCEEDED_IN_WEST_ROUND);
        });

        it('returns undefined when already in west with goal met but the round did not end with a win', () => {
            const rules = { ...mahjongSoulRules };

            expect(shouldFinishGame(
                gameState(Wind.WEST, 2),
                gameState(Wind.WEST, 3),
                fourPlayers([31000, 25000, 24000, 20000]),
                makeGameRules(rules),
                rules,
                exhaustiveDraw
            )).toBeUndefined();
        });
    });
});
