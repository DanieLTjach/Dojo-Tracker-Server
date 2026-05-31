import { describe, expect, it } from '@jest/globals';
import { gameRulesPresetsByKey } from '../src/data/gameRulesPresets.ts';
import type { GameRulesValues } from '../src/data/gameRulesCatalog.ts';
import { Wind } from '../src/model/GameModels.ts';
import { calculateNextRoundState } from '../src/util/PointCalculationUtil.ts';
import { fourPlayers, gameState } from './pointCalculationUtil.helpers.ts';

describe('calculateNextRoundState', () => {
    const emaRules = gameRulesPresetsByKey.get('ema_2025')!.rules;
    const mahjongSoulRules = gameRulesPresetsByKey.get('mahjong_soul')!.rules;
    const players = fourPlayers();

    describe('TSUMO', () => {
        it('increments counters and clears riichi sticks when the dealer wins', () => {
            const current = gameState(Wind.SOUTH, 1, 2, 1);

            expect(calculateNextRoundState(current, players, emaRules, {
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: 1, yakumanCount: 0, han: 3, fu: 40 },
                riichiPlayerIds: [],
            })).toEqual(gameState(Wind.SOUTH, 1, 3, 0));
        });

        it('resets counters and riichi sticks and advances dealer when a non-dealer wins', () => {
            const current = gameState(Wind.EAST, 1, 2, 1);

            expect(calculateNextRoundState(current, players, emaRules, {
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 },
                riichiPlayerIds: [],
            })).toEqual(gameState(Wind.EAST, 2, 0, 0));
        });

        it('advances wind and resets dealer to 1 when the last dealer seat loses', () => {
            const current = gameState(Wind.EAST, 4, 1, 2);

            expect(calculateNextRoundState(current, players, emaRules, {
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 },
                riichiPlayerIds: [],
            })).toEqual(gameState(Wind.SOUTH, 1, 0, 0));
        });
    });

    describe('RON', () => {
        it('increments counters and clears riichi sticks when the dealer wins', () => {
            const current = gameState(Wind.WEST, 3, 4, 3);

            expect(calculateNextRoundState(current, players, emaRules, {
                type: 'RON',
                dealInPlayerId: 4,
                winningHandData: [{ winnerPlayerId: 3, yakumanCount: 0, han: 3, fu: 40 }],
                riichiPlayerIds: [],
            })).toEqual(gameState(Wind.WEST, 3, 5, 0));
        });

        it('resets counters and riichi sticks and advances dealer when a non-dealer wins', () => {
            const current = gameState(Wind.SOUTH, 2, 3, 1);

            expect(calculateNextRoundState(current, players, emaRules, {
                type: 'RON',
                dealInPlayerId: 3,
                winningHandData: [{ winnerPlayerId: 1, yakumanCount: 0, han: 3, fu: 40 }],
                riichiPlayerIds: [],
            })).toEqual(gameState(Wind.SOUTH, 3, 0, 0));
        });
    });

    describe('EXHAUSTIVE_DRAW', () => {
        it('increments counters, adds riichi sticks, and keeps dealer when dealer is tenpai with tenpai continuation', () => {
            const current = gameState(Wind.EAST, 1, 1, 1);

            expect(calculateNextRoundState(current, players, emaRules, {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [2, 3],
                tenpaiPlayerIds: [1],
                nagashiManganPlayerIds: [],
            })).toEqual(gameState(Wind.EAST, 1, 2, 3));
        });

        it('increments counters, adds riichi sticks, and advances dealer when dealer is not tenpai', () => {
            const current = gameState(Wind.EAST, 1, 1, 1);

            expect(calculateNextRoundState(current, players, emaRules, {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [2],
                tenpaiPlayerIds: [2, 3],
                nagashiManganPlayerIds: [],
            })).toEqual(gameState(Wind.EAST, 2, 2, 2));
        });

        it('advances dealer even when dealer is tenpai if continuation is agari', () => {
            const rules: GameRulesValues = { ...emaRules, continuation: 'agari' };
            const current = gameState(Wind.EAST, 1, 0, 0);

            expect(calculateNextRoundState(current, players, rules, {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [],
                tenpaiPlayerIds: [1],
                nagashiManganPlayerIds: [],
            })).toEqual(gameState(Wind.EAST, 2, 1, 0));
        });

        it('advances wind when the last dealer seat draws without dealer continuation', () => {
            const current = gameState(Wind.NORTH, 4, 2, 0);

            expect(calculateNextRoundState(current, players, emaRules, {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [],
                tenpaiPlayerIds: [2],
                nagashiManganPlayerIds: [],
            })).toEqual(gameState(Wind.EAST, 1, 3, 0));
        });
    });

    describe('EXHAUSTIVE_DRAW with nagashi mangan', () => {
        it('treats nagashi as a draw: advances a non-tenpai dealer and carries the bank', () => {
            // Nagashi mangan is scored on the point side only; the riichi-stick bank (2) stays
            // on the table, and continuation follows the normal tenpai draw rule.
            const current = gameState(Wind.EAST, 1, 1, 2);

            expect(calculateNextRoundState(current, players, mahjongSoulRules, {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [],
                tenpaiPlayerIds: [],
                nagashiManganPlayerIds: [1],
            })).toEqual(gameState(Wind.EAST, 2, 2, 2));
        });

        it('treats nagashi as a draw: keeps a tenpai dealer and carries the bank plus this round\'s sticks', () => {
            // Carried bank (2) plus the stick declared this round (1) roll forward to next round.
            const current = gameState(Wind.EAST, 1, 1, 2);

            expect(calculateNextRoundState(current, players, mahjongSoulRules, {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [2],
                tenpaiPlayerIds: [1],
                nagashiManganPlayerIds: [1],
            })).toEqual(gameState(Wind.EAST, 1, 2, 3));
        });
    });

    describe('ABORTIVE_DRAW', () => {
        it('increments counters, adds riichi sticks, and keeps dealer when continuation on abortion is enabled', () => {
            const current = gameState(Wind.SOUTH, 3, 2, 1);

            expect(calculateNextRoundState(current, players, mahjongSoulRules, {
                type: 'ABORTIVE_DRAW',
                drawType: 'FOUR_RIICHI',
                riichiPlayerIds: [1, 2, 3, 4],
            })).toEqual(gameState(Wind.SOUTH, 3, 3, 5));
        });

        it('increments counters, adds riichi sticks, and advances dealer when continuation on abortion is disabled', () => {
            const rules: GameRulesValues = { ...emaRules, continuation_when_abortion: false };
            const current = gameState(Wind.SOUTH, 3, 2, 1);

            expect(calculateNextRoundState(current, players, rules, {
                type: 'ABORTIVE_DRAW',
                drawType: 'NINE_TERMINALS',
                riichiPlayerIds: [2],
            })).toEqual(gameState(Wind.SOUTH, 4, 3, 2));
        });

        it('advances wind when the last dealer seat aborts without dealer continuation', () => {
            const rules: GameRulesValues = { ...emaRules, continuation_when_abortion: false };
            const current = gameState(Wind.WEST, 4, 0, 2);

            expect(calculateNextRoundState(current, players, rules, {
                type: 'ABORTIVE_DRAW',
                drawType: 'FOUR_WINDS',
                riichiPlayerIds: [],
            })).toEqual(gameState(Wind.NORTH, 1, 1, 2));
        });
    });

    describe('CHOMBO', () => {
        it('leaves all GameState fields unchanged', () => {
            const current = gameState(Wind.EAST, 2, 3, 2);

            expect(calculateNextRoundState(current, players, emaRules, {
                type: 'CHOMBO',
                offenderPlayerId: 2,
            })).toEqual(current);
        });
    });
});
