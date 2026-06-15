import { describe, expect, it } from '@jest/globals';
import { gameRulesPresetsByKey } from '../src/data/gameRulesPresets.ts';
import type { GameRulesValues } from '../src/data/gameRulesCatalog.ts';
import { Wind } from '../src/model/GameModels.ts';
import type { GameState } from '../src/model/GameModels.ts';
import type { GameRoundResultInputDTO, PlayerPointChange } from '../src/model/GameRoundResultModels.ts';
import { calculateGameRoundResult } from '../src/util/PointCalculationUtil.ts';
import {
    HandShouldBeRecordedAsCountedYakumanError,
    TwoHanMinimumIsRequiredError,
    FuRequiredForLowHanHandError,
    NoDoubleRonFirstWinsOnlyError,
    NoTripleRonFirstWinsOnlyError,
    TripleRonShouldBeAbortiveDrawError,
    DealInPlayerCannotBeWinnerError,
    NagashiManganNotInRulesetError,
    PlayerNotInGameError,
} from '../src/error/PointCalculationErrors.ts';
import { detailedGame, fourPlayers, gameState, makeGameRules } from './pointCalculationUtil.helpers.ts';

const ema = gameRulesPresetsByKey.get('ema_2025')!.rules;
const mahjongSoul = gameRulesPresetsByKey.get('mahjong_soul')!.rules;

function pointChanges(
    rules: GameRulesValues,
    state: GameState,
    result: GameRoundResultInputDTO,
): PlayerPointChange[] {
    const game = detailedGame(fourPlayers(), state);
    return calculateGameRoundResult(game, makeGameRules(rules), result).playerPointChanges;
}

// Sort by playerId so assertions are independent of merge insertion order.
function sorted(changes: PlayerPointChange[]): PlayerPointChange[] {
    return [...changes].sort((a, b) => a.playerId - b.playerId);
}

function expectChanges(
    rules: GameRulesValues,
    state: GameState,
    result: GameRoundResultInputDTO,
    expected: PlayerPointChange[],
): void {
    expect(sorted(pointChanges(rules, state, result))).toEqual(sorted(expected));
}

describe('calculateRoundPointChanges (via calculateGameRoundResult)', () => {
    describe('TSUMO', () => {
        // 3 han 40 fu -> base = min(2000, 40 * 2^5) = 1280
        it('non-dealer tsumo pays dealer double', () => {
            expectChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 },
                riichiPlayerIds: [],
            }, [
                { playerId: 1, pointChange: -2600 },
                { playerId: 3, pointChange: -1300 },
                { playerId: 4, pointChange: -1300 },
                { playerId: 2, pointChange: 5200 },
            ]);
        });

        it('dealer tsumo charges every non-dealer the dealer rate', () => {
            expectChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: 1, yakumanCount: 0, han: 3, fu: 40 },
                riichiPlayerIds: [],
            }, [
                { playerId: 2, pointChange: -2600 },
                { playerId: 3, pointChange: -2600 },
                { playerId: 4, pointChange: -2600 },
                { playerId: 1, pointChange: 7800 },
            ]);
        });

        it('adds honba payments per payer from the counters', () => {
            // counters = 2, honba 3x100 -> 100/honba -> 200 extra per payer
            expectChanges(ema, gameState(Wind.EAST, 1, 2, 0), {
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 },
                riichiPlayerIds: [],
            }, [
                { playerId: 1, pointChange: -2800 },
                { playerId: 3, pointChange: -1500 },
                { playerId: 4, pointChange: -1500 },
                { playerId: 2, pointChange: 5800 },
            ]);
        });

        it('awards the riichi-stick bank to the winner', () => {
            // bank of 3 sticks -> +3000 to winner on top of base +5200
            expectChanges(ema, gameState(Wind.EAST, 1, 0, 3), {
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 },
                riichiPlayerIds: [],
            }, [
                { playerId: 1, pointChange: -2600 },
                { playerId: 3, pointChange: -1300 },
                { playerId: 4, pointChange: -1300 },
                { playerId: 2, pointChange: 8200 },
            ]);
        });

        it('collects a stick when another player declared riichi this round', () => {
            expectChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 },
                riichiPlayerIds: [3],
            }, [
                { playerId: 1, pointChange: -2600 },
                { playerId: 3, pointChange: -2300 },
                { playerId: 4, pointChange: -1300 },
                { playerId: 2, pointChange: 6200 },
            ]);
        });

        it('does not charge the winner for their own riichi this round', () => {
            // riichi_deposit_is_returned_if_one_of_multiple_ron = true filters the winner out
            expectChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 },
                riichiPlayerIds: [2],
            }, [
                { playerId: 1, pointChange: -2600 },
                { playerId: 3, pointChange: -1300 },
                { playerId: 4, pointChange: -1300 },
                { playerId: 2, pointChange: 5200 },
            ]);
        });

        it('scores a yakuman tsumo (base 8000)', () => {
            expectChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: 2, yakumanCount: 1 },
                riichiPlayerIds: [],
            }, [
                { playerId: 1, pointChange: -16000 },
                { playerId: 3, pointChange: -8000 },
                { playerId: 4, pointChange: -8000 },
                { playerId: 2, pointChange: 32000 },
            ]);
        });

        it('routes a yakuman tsumo with liability through ron (liable player pays all)', () => {
            expectChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: 2, yakumanCount: 1, yakumanLiabilityPlayerId: 3 },
                riichiPlayerIds: [],
            }, [
                { playerId: 3, pointChange: -32000 },
                { playerId: 2, pointChange: 32000 },
            ]);
        });

        it('rejects a 13-han hand when counted yakuman is enabled', () => {
            expect(() => pointChanges(mahjongSoul, gameState(Wind.EAST, 1, 0, 0), {
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: 2, yakumanCount: 0, han: 13, fu: 30 },
                riichiPlayerIds: [],
            })).toThrow(HandShouldBeRecordedAsCountedYakumanError);
        });

        it('rejects a 1-han hand when two-han-minimum is enabled', () => {
            const rules: GameRulesValues = { ...ema, two_han_minimum: true };
            expect(() => pointChanges(rules, gameState(Wind.EAST, 1, 0, 0), {
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: 2, yakumanCount: 0, han: 1, fu: 30 },
                riichiPlayerIds: [],
            })).toThrow(TwoHanMinimumIsRequiredError);
        });

        it('requires fu for a low-han hand', () => {
            expect(() => pointChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: 2, yakumanCount: 0, han: 3 },
                riichiPlayerIds: [],
            })).toThrow(FuRequiredForLowHanHandError);
        });
    });

    describe('RON', () => {
        // 3 han 40 fu -> base 1280
        it('single ron, non-dealer winner', () => {
            expectChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'RON',
                dealInPlayerId: 4,
                winningHandData: [{ winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 }],
                riichiPlayerIds: [],
            }, [
                { playerId: 4, pointChange: -5200 },
                { playerId: 2, pointChange: 5200 },
            ]);
        });

        it('single ron, dealer winner (1.5x)', () => {
            expectChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'RON',
                dealInPlayerId: 4,
                winningHandData: [{ winnerPlayerId: 1, yakumanCount: 0, han: 3, fu: 40 }],
                riichiPlayerIds: [],
            }, [
                { playerId: 4, pointChange: -7700 },
                { playerId: 1, pointChange: 7700 },
            ]);
        });

        it('adds full honba to the discarder', () => {
            // counters 3, honba 100 -> 100*3*(4-1) = 900
            expectChanges(ema, gameState(Wind.EAST, 1, 3, 0), {
                type: 'RON',
                dealInPlayerId: 4,
                winningHandData: [{ winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 }],
                riichiPlayerIds: [],
            }, [
                { playerId: 4, pointChange: -6100 },
                { playerId: 2, pointChange: 6100 },
            ]);
        });

        it('double ron pays both winners and honba to each (payment "all")', () => {
            // counters 2 -> honba per hand = 100*2*3 = 600
            expectChanges(ema, gameState(Wind.EAST, 1, 2, 0), {
                type: 'RON',
                dealInPlayerId: 4,
                winningHandData: [
                    { winnerPlayerId: 1, yakumanCount: 0, han: 3, fu: 40 },
                    { winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 },
                ],
                riichiPlayerIds: [],
            }, [
                { playerId: 4, pointChange: -14100 },
                { playerId: 1, pointChange: 8300 },
                { playerId: 2, pointChange: 5800 },
            ]);
        });

        it('resolves double ron via head bump when configured', () => {
            const rules: GameRulesValues = { ...mahjongSoul, double_ron: 'head_bump' };
            // discarder p4 (NORTH); first winner counterclockwise is p2; honba bump included: 100*2*3=600
            expectChanges(rules, gameState(Wind.EAST, 1, 2, 0), {
                type: 'RON',
                dealInPlayerId: 4,
                winningHandData: [
                    { winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 },
                    { winnerPlayerId: 3, yakumanCount: 0, han: 3, fu: 40 },
                ],
                riichiPlayerIds: [],
            }, [
                { playerId: 4, pointChange: -5800 },
                { playerId: 2, pointChange: 5800 },
            ]);
        });

        it('rejects triple ron when triple_ron is "cancel"', () => {
            const rules: GameRulesValues = { ...ema, triple_ron: 'cancel' };
            expect(() => pointChanges(rules, gameState(Wind.EAST, 1, 0, 0), {
                type: 'RON',
                dealInPlayerId: 4,
                winningHandData: [
                    { winnerPlayerId: 1, yakumanCount: 0, han: 3, fu: 40 },
                    { winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 },
                    { winnerPlayerId: 3, yakumanCount: 0, han: 3, fu: 40 },
                ],
                riichiPlayerIds: [],
            })).toThrow(TripleRonShouldBeAbortiveDrawError);
        });

        it('rejects triple ron when triple_ron is "first"', () => {
            const rules: GameRulesValues = { ...ema, triple_ron: 'first' };
            expect(() => pointChanges(rules, gameState(Wind.EAST, 1, 0, 0), {
                type: 'RON',
                dealInPlayerId: 4,
                winningHandData: [
                    { winnerPlayerId: 1, yakumanCount: 0, han: 3, fu: 40 },
                    { winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 },
                    { winnerPlayerId: 3, yakumanCount: 0, han: 3, fu: 40 },
                ],
                riichiPlayerIds: [],
            })).toThrow(NoTripleRonFirstWinsOnlyError);
        });

        it('rejects double ron when double_ron is "first"', () => {
            const rules: GameRulesValues = { ...ema, double_ron: 'first' };
            expect(() => pointChanges(rules, gameState(Wind.EAST, 1, 0, 0), {
                type: 'RON',
                dealInPlayerId: 4,
                winningHandData: [
                    { winnerPlayerId: 1, yakumanCount: 0, han: 3, fu: 40 },
                    { winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 },
                ],
                riichiPlayerIds: [],
            })).toThrow(NoDoubleRonFirstWinsOnlyError);
        });

        it('rejects a hand where the deal-in player is also a winner', () => {
            // 2-hand ron so head-bump resolution finds a valid winner before the deal-in==winner hand
            expect(() => pointChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'RON',
                dealInPlayerId: 2,
                winningHandData: [
                    { winnerPlayerId: 3, yakumanCount: 0, han: 3, fu: 40 },
                    { winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 },
                ],
                riichiPlayerIds: [],
            })).toThrow(DealInPlayerCannotBeWinnerError);
        });
    });

    describe('EXHAUSTIVE_DRAW (noten payments)', () => {
        it('1 tenpai / 3 noten', () => {
            expectChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [],
                tenpaiPlayerIds: [1],
                nagashiManganPlayerIds: [],
            }, [
                { playerId: 2, pointChange: -1000 },
                { playerId: 3, pointChange: -1000 },
                { playerId: 4, pointChange: -1000 },
                { playerId: 1, pointChange: 3000 },
            ]);
        });

        it('2 tenpai / 2 noten', () => {
            expectChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [],
                tenpaiPlayerIds: [1, 2],
                nagashiManganPlayerIds: [],
            }, [
                { playerId: 3, pointChange: -1500 },
                { playerId: 4, pointChange: -1500 },
                { playerId: 1, pointChange: 1500 },
                { playerId: 2, pointChange: 1500 },
            ]);
        });

        it('3 tenpai / 1 noten', () => {
            expectChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [],
                tenpaiPlayerIds: [1, 2, 3],
                nagashiManganPlayerIds: [],
            }, [
                { playerId: 4, pointChange: -3000 },
                { playerId: 1, pointChange: 1000 },
                { playerId: 2, pointChange: 1000 },
                { playerId: 3, pointChange: 1000 },
            ]);
        });

        it('all tenpai -> no payments', () => {
            expectChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [],
                tenpaiPlayerIds: [1, 2, 3, 4],
                nagashiManganPlayerIds: [],
            }, []);
        });

        it('all noten -> no payments', () => {
            expectChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [],
                tenpaiPlayerIds: [],
                nagashiManganPlayerIds: [],
            }, []);
        });

        it('deducts riichi sticks declared this round', () => {
            expectChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [2, 3],
                tenpaiPlayerIds: [1],
                nagashiManganPlayerIds: [],
            }, [
                { playerId: 2, pointChange: -2000 },
                { playerId: 3, pointChange: -2000 },
                { playerId: 4, pointChange: -1000 },
                { playerId: 1, pointChange: 3000 },
            ]);
        });
    });

    describe('NAGASHI MANGAN', () => {
        it('scores a non-dealer achiever as a mangan tsumo', () => {
            expectChanges(mahjongSoul, gameState(Wind.EAST, 1, 0, 0), {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [],
                tenpaiPlayerIds: [],
                nagashiManganPlayerIds: [2],
            }, [
                { playerId: 1, pointChange: -4000 },
                { playerId: 3, pointChange: -2000 },
                { playerId: 4, pointChange: -2000 },
                { playerId: 2, pointChange: 8000 },
            ]);
        });

        it('scores a dealer achiever as a dealer mangan tsumo', () => {
            expectChanges(mahjongSoul, gameState(Wind.EAST, 1, 0, 0), {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [],
                tenpaiPlayerIds: [],
                nagashiManganPlayerIds: [1],
            }, [
                { playerId: 2, pointChange: -4000 },
                { playerId: 3, pointChange: -4000 },
                { playerId: 4, pointChange: -4000 },
                { playerId: 1, pointChange: 12000 },
            ]);
        });

        it('handles two achievers as independent mangan tsumos', () => {
            expectChanges(mahjongSoul, gameState(Wind.EAST, 1, 0, 0), {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [],
                tenpaiPlayerIds: [],
                nagashiManganPlayerIds: [2, 3],
            }, [
                { playerId: 1, pointChange: -8000 },
                { playerId: 2, pointChange: 6000 },
                { playerId: 3, pointChange: 6000 },
                { playerId: 4, pointChange: -4000 },
            ]);
        });

        it('leaves a carried riichi-stick bank on the table (the achiever does not collect it)', () => {
            // The bank of 3 sticks stays on the table; only the mangan payments apply.
            expectChanges(mahjongSoul, gameState(Wind.EAST, 1, 0, 3), {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [],
                tenpaiPlayerIds: [],
                nagashiManganPlayerIds: [2],
            }, [
                { playerId: 1, pointChange: -4000 },
                { playerId: 3, pointChange: -2000 },
                { playerId: 4, pointChange: -2000 },
                { playerId: 2, pointChange: 8000 },
            ]);
        });

        it('takes this round\'s riichi deposits to the table without awarding them to the achiever', () => {
            // Player 3's declared riichi stick (-1000) joins the bank rather than going to the achiever.
            expectChanges(mahjongSoul, gameState(Wind.EAST, 1, 0, 0), {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [3],
                tenpaiPlayerIds: [],
                nagashiManganPlayerIds: [2],
            }, [
                { playerId: 1, pointChange: -4000 },
                { playerId: 3, pointChange: -3000 },
                { playerId: 4, pointChange: -2000 },
                { playerId: 2, pointChange: 8000 },
            ]);
        });

        it('rejects nagashi mangan when the ruleset disables it', () => {
            expect(() => pointChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [],
                tenpaiPlayerIds: [],
                nagashiManganPlayerIds: [2],
            })).toThrow(NagashiManganNotInRulesetError);
        });
    });

    describe('CHOMBO', () => {
        it('twenty_thousand_after_uma defers to rating (no point changes)', () => {
            expectChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'CHOMBO',
                offenderPlayerId: 2,
            }, []);
        });

        it('mangan mode: a non-dealer offender pays a mangan to everyone', () => {
            const rules: GameRulesValues = { ...ema, chombo: 'mangan' };
            expectChanges(rules, gameState(Wind.EAST, 1, 0, 0), {
                type: 'CHOMBO',
                offenderPlayerId: 2,
            }, [
                { playerId: 1, pointChange: 4000 },
                { playerId: 3, pointChange: 2000 },
                { playerId: 4, pointChange: 2000 },
                { playerId: 2, pointChange: -8000 },
            ]);
        });

        it('mangan mode: a dealer offender pays a dealer mangan to everyone', () => {
            const rules: GameRulesValues = { ...ema, chombo: 'mangan' };
            expectChanges(rules, gameState(Wind.EAST, 1, 0, 0), {
                type: 'CHOMBO',
                offenderPlayerId: 1,
            }, [
                { playerId: 2, pointChange: 4000 },
                { playerId: 3, pointChange: 4000 },
                { playerId: 4, pointChange: 4000 },
                { playerId: 1, pointChange: -12000 },
            ]);
        });
    });

    describe('player-in-game validation', () => {
        it('rejects a chombo offender not in the game', () => {
            expect(() => pointChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'CHOMBO',
                offenderPlayerId: 99,
            })).toThrow(PlayerNotInGameError);
        });

        it('rejects a tsumo winner not in the game', () => {
            expect(() => pointChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: 99, yakumanCount: 0, han: 3, fu: 40 },
                riichiPlayerIds: [],
            })).toThrow(PlayerNotInGameError);
        });

        it('rejects a ron deal-in player not in the game', () => {
            expect(() => pointChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'RON',
                dealInPlayerId: 99,
                winningHandData: [{ winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 }],
                riichiPlayerIds: [],
            })).toThrow(PlayerNotInGameError);
        });

        it('rejects a ron winner not in the game', () => {
            expect(() => pointChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'RON',
                dealInPlayerId: 4,
                winningHandData: [{ winnerPlayerId: 99, yakumanCount: 0, han: 3, fu: 40 }],
                riichiPlayerIds: [],
            })).toThrow(PlayerNotInGameError);
        });

        it('rejects an exhaustive-draw tenpai id not in the game', () => {
            expect(() => pointChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [],
                tenpaiPlayerIds: [99],
                nagashiManganPlayerIds: [],
            })).toThrow(PlayerNotInGameError);
        });

        it('rejects an exhaustive-draw nagashi id not in the game (before the ruleset check)', () => {
            expect(() => pointChanges(mahjongSoul, gameState(Wind.EAST, 1, 0, 0), {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [],
                tenpaiPlayerIds: [],
                nagashiManganPlayerIds: [99],
            })).toThrow(PlayerNotInGameError);
        });

        it('rejects an exhaustive-draw riichi id not in the game', () => {
            expect(() => pointChanges(ema, gameState(Wind.EAST, 1, 0, 0), {
                type: 'EXHAUSTIVE_DRAW',
                riichiPlayerIds: [99],
                tenpaiPlayerIds: [1],
                nagashiManganPlayerIds: [],
            })).toThrow(PlayerNotInGameError);
        });
    });
});
