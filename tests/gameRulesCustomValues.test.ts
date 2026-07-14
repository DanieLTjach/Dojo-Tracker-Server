import { describe, expect, test } from '@jest/globals';
import { buildDetailsSchemaForCore } from '../src/schema/GameRulesSchemas.ts';
import { gameRulesCatalogByKey } from '../src/data/gameRulesCatalog.ts';
import { gameRulesPresetsByKey } from '../src/data/gameRulesPresets.ts';
import type { GameRulesValues } from '../src/data/gameRulesCatalog.ts';
import { getNotenPenalty, getHonbaValue, getRiichiDepositValue } from '../src/util/RulesUtils.ts';
import {
    calculateGameRoundResult,
    calculateRemainingRiichiSticksPointChanges,
} from '../src/util/PointCalculationUtil.ts';
import { Wind } from '../src/model/GameModels.ts';
import type { PlayerPointChange } from '../src/model/GameRoundResultModels.ts';
import { detailedGame, fourPlayers, gameState, makeGameRules } from './pointCalculationUtil.helpers.ts';
import { InsufficientPointsForRiichiError } from '../src/error/PointCalculationErrors.ts';

const sortByPlayer = (changes: PlayerPointChange[]) => [...changes].sort((a, b) => a.playerId - b.playerId);

const notenDraw = (notenPenalty: number, tenpaiPlayerIds: number[]) => {
    const game = detailedGame(fourPlayers(), gameState(Wind.EAST, 1, 0, 0));
    const rules = makeGameRules({ number_of_players: 4, starting_points: 25000, noten_penalty: notenPenalty });
    const result = calculateGameRoundResult(game, rules, {
        type: 'EXHAUSTIVE_DRAW',
        riichiPlayerIds: [],
        tenpaiPlayerIds,
        nagashiManganPlayerIds: [],
    });
    return sortByPlayer(result.playerPointChanges);
};

const sumOf = (changes: PlayerPointChange[]) => changes.reduce((acc, change) => acc + change.pointChange, 0);
const yonmaDetailsSchema = buildDetailsSchemaForCore({ numberOfPlayers: 4, startingPoints: 30000 });
const sanmaDetailsSchema = buildDetailsSchemaForCore({ numberOfPlayers: 3, startingPoints: 35000 });

describe('custom noten_penalty (integer)', () => {
    test('catalog spec is an integer with a multipleOf-100 constraint', () => {
        const spec = gameRulesCatalogByKey.get('noten_penalty');
        expect(spec).toBeDefined();
        expect(spec!.type).toBe('integer');
        if (spec!.type === 'integer') {
            expect(spec!.min).toBe(0);
            expect(spec!.multipleOf).toBe(100);
        }
    });

    test.each([0, 600, 1200, 1500, 3000, 4200])(
        'schema accepts yonma noten_penalty %d (divisible by 6)',
        value => {
            const result = yonmaDetailsSchema.safeParse({
                rules: { noten_penalty: value },
            });

            expect(result.success).toBe(true);
        }
    );

    test.each([0, 1000, 2000, 2500, 3500])(
        'schema accepts sanma noten_penalty %d (divisible by 2)',
        value => {
            const result = sanmaDetailsSchema.safeParse({
                rules: { noten_penalty: value },
            });

            expect(result.success).toBe(true);
        }
    );

    test.each([1000, 2000, 4000, 100, 500])(
        'schema rejects yonma noten_penalty %d that is not divisible by 6',
        value => {
            const result = yonmaDetailsSchema.safeParse({
                rules: { noten_penalty: value },
            });

            expect(result.success).toBe(false);
        }
    );

    test.each([100, 500, 2500, 4500])(
        'schema accepts any multiple-of-100 sanma noten_penalty %d',
        value => {
            const result = sanmaDetailsSchema.safeParse({
                rules: { noten_penalty: value },
            });

            expect(result.success).toBe(true);
        }
    );

    test('divisibility uses the authoritative top-level player count', () => {
        const result = yonmaDetailsSchema.safeParse({
            preset: 'ema_2025',
            rules: { noten_penalty: 1000 },
        });

        expect(result.success).toBe(false);
    });

    test('schema rejects a noten_penalty that is not a multiple of 100', () => {
        const result = yonmaDetailsSchema.safeParse({
            rules: { noten_penalty: 1234 },
        });

        expect(result.success).toBe(false);
    });

    test('schema rejects a negative noten_penalty', () => {
        const result = yonmaDetailsSchema.safeParse({
            rules: { noten_penalty: -1000 },
        });

        expect(result.success).toBe(false);
    });

    test('getNotenPenalty returns the stored custom value when set', () => {
        const rules: GameRulesValues = { number_of_players: 4, noten_penalty: 1500 };
        expect(getNotenPenalty(rules)).toBe(1500);
    });

    test('getNotenPenalty defaults to 1000 * (players - 1) when unset', () => {
        expect(getNotenPenalty({ number_of_players: 4 })).toBe(3000);
        expect(getNotenPenalty({ number_of_players: 3 })).toBe(2000);
    });
});

describe('configurable honba', () => {
    test('catalog exposes common per-payer suggestions while retaining string storage', () => {
        const spec = gameRulesCatalogByKey.get('honba');
        expect(spec).toBeDefined();
        expect(spec!.type).toBe('string');
        expect(spec!.suggestions).toEqual([100, 200, 300, 500]);
    });

    test.each([
        ['2x100', 100],
        ['2x200', 200],
        ['2x300', 300],
        ['2x500', 500],
        ['3x100', 100],
        ['3x200', 200],
        ['3x300', 300],
        ['3x500', 500],
        ['3x700', 700],
        ['3x1200', 1200],
    ])('schema accepts honba %s and getHonbaValue parses it to %d', (honba, expected) => {
        const result = (honba.startsWith('2x') ? sanmaDetailsSchema : yonmaDetailsSchema).safeParse({
            rules: { honba },
        });

        expect(result.success).toBe(true);
        expect(getHonbaValue({ honba } as GameRulesValues)).toBe(expected);
    });

    test.each(['3x50', '3x-100', '3x100.5', '4x100'])('schema rejects invalid honba value %s', honba => {
        const result = yonmaDetailsSchema.safeParse({
            rules: { honba },
        });

        expect(result.success).toBe(false);
    });

    test('schema uses the top-level player count to validate the payer count', () => {
        const result = sanmaDetailsSchema.safeParse({
            rules: { honba: '3x500' },
        });

        expect(result.success).toBe(false);
    });
});

describe('sanma akadora values', () => {
    test.each([
        'none',
        'two_red_fives_five_pin_and_five_sou',
        'three_red_fives_two_pin_and_one_sou',
    ])('accepts %s', redFives => {
        expect(sanmaDetailsSchema.safeParse({ rules: { red_fives: redFives } }).success).toBe(true);
    });

    test.each([
        'three_one_per_suit',
        'four_red_fives_two_pin_and_two_sou',
    ])('rejects the yonma-only value %s for sanma', redFives => {
        expect(sanmaDetailsSchema.safeParse({ rules: { red_fives: redFives } }).success).toBe(false);
    });
});

describe('configurable riichi deposits', () => {
    const customRules: GameRulesValues = {
        ...gameRulesPresetsByKey.get('ema_2025')!.rules,
        riichi_deposit_value: 1500,
    };

    test('catalog exposes a step-100 non-negative integer with common suggestions', () => {
        const spec = gameRulesCatalogByKey.get('riichi_deposit_value');
        expect(spec).toMatchObject({
            type: 'integer',
            min: 0,
            multipleOf: 100,
            suggestions: [500, 1000, 1500, 2000],
        });
    });

    test('missing value retains the legacy 1000-point behavior', () => {
        expect(getRiichiDepositValue({})).toBe(1000);
    });

    test('tsumo scoring uses the configured value for bank payouts and new declarations', () => {
        const result = calculateGameRoundResult(
            detailedGame(fourPlayers(), gameState(Wind.EAST, 1, 0, 2)),
            makeGameRules(customRules),
            {
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 },
                riichiPlayerIds: [3],
            }
        );

        expect(sortByPlayer(result.playerPointChanges)).toEqual([
            { playerId: 1, pointChange: -2600 },
            { playerId: 2, pointChange: 9700 },
            { playerId: 3, pointChange: -2800 },
            { playerId: 4, pointChange: -1300 },
        ]);
    });

    test('ron scoring uses the configured value for bank payouts and new declarations', () => {
        const result = calculateGameRoundResult(
            detailedGame(fourPlayers(), gameState(Wind.EAST, 1, 0, 2)),
            makeGameRules(customRules),
            {
                type: 'RON',
                dealInPlayerId: 4,
                winningHandData: [{ winnerPlayerId: 2, yakumanCount: 0, han: 3, fu: 40 }],
                riichiPlayerIds: [3],
            }
        );

        expect(sortByPlayer(result.playerPointChanges)).toEqual([
            { playerId: 2, pointChange: 9700 },
            { playerId: 3, pointChange: -1500 },
            { playerId: 4, pointChange: -5200 },
        ]);
    });

    test.each(['EXHAUSTIVE_DRAW', 'ABORTIVE_DRAW'] as const)(
        '%s charges the configured declaration value and carries one bank stick',
        type => {
            const result = calculateGameRoundResult(
                detailedGame(fourPlayers(), gameState(Wind.EAST, 1, 0, 0)),
                makeGameRules({ ...customRules, abortive_draw: true }),
                type === 'EXHAUSTIVE_DRAW'
                    ? {
                        type,
                        tenpaiPlayerIds: [],
                        nagashiManganPlayerIds: [],
                        riichiPlayerIds: [2],
                    }
                    : { type, drawType: 'FOUR_WINDS', riichiPlayerIds: [2] }
            );

            expect(result.playerPointChanges).toContainEqual({ playerId: 2, pointChange: -1500 });
            expect(result.nextState?.riichiSticks).toBe(1);
        }
    );

    test('finish distribution uses the configured value', () => {
        const rules = makeGameRules(customRules);
        const changes = calculateRemainingRiichiSticksPointChanges(
            fourPlayers([30000, 25000, 24000, 21000]),
            rules,
            2
        );

        expect(changes).toEqual([{ playerId: 1, pointChange: 3000 }]);
    });

    test('the legacy minimum flag requires enough points for the configured deposit', () => {
        expect(() =>
            calculateGameRoundResult(
                detailedGame(fourPlayers([1000, 25000, 25000, 25000]), gameState(Wind.EAST)),
                makeGameRules({ ...customRules, riichi_1000_points_min: true }),
                {
                    type: 'EXHAUSTIVE_DRAW',
                    tenpaiPlayerIds: [],
                    nagashiManganPlayerIds: [],
                    riichiPlayerIds: [1],
                }
            )
        ).toThrow(InsufficientPointsForRiichiError);
    });
});

describe('noten payment splits cleanly for validated penalties', () => {
    test.each<[string, number[], PlayerPointChange[]]>([
        ['1 tenpai / 3 noten', [1], [
            { playerId: 1, pointChange: 3000 },
            { playerId: 2, pointChange: -1000 },
            { playerId: 3, pointChange: -1000 },
            { playerId: 4, pointChange: -1000 },
        ]],
        ['2 tenpai / 2 noten', [1, 2], [
            { playerId: 1, pointChange: 1500 },
            { playerId: 2, pointChange: 1500 },
            { playerId: 3, pointChange: -1500 },
            { playerId: 4, pointChange: -1500 },
        ]],
        ['3 tenpai / 1 noten', [1, 2, 3], [
            { playerId: 1, pointChange: 1000 },
            { playerId: 2, pointChange: 1000 },
            { playerId: 3, pointChange: 1000 },
            { playerId: 4, pointChange: -3000 },
        ]],
    ])('standard 3000 penalty keeps the classic split: %s', (_caseName, tenpai, expected) => {
        expect(notenDraw(3000, tenpai)).toEqual(expected);
    });

    test.each([
        [600, [1]],
        [1200, [1, 2]],
        [3000, [1, 2, 3]],
        [4200, [1]],
    ])('yonma penalty %d with tenpai %j divides cleanly and is zero-sum', (penalty, tenpai) => {
        const changes = notenDraw(penalty, tenpai);
        expect(sumOf(changes)).toBe(0);
        for (const change of changes) {
            expect(Number.isInteger(change.pointChange)).toBe(true);
        }
    });
});
