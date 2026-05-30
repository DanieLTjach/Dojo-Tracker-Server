import { describe, expect, test } from '@jest/globals';
import { gameRulesDetailsSchema } from '../src/schema/GameRulesSchemas.ts';
import { gameRulesCatalogByKey } from '../src/data/gameRulesCatalog.ts';
import type { GameRulesValues } from '../src/data/gameRulesCatalog.ts';
import { getNotenPenalty, getHonbaValue } from '../src/util/RulesUtils.ts';

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

    test.each([0, 1000, 1500, 2000, 3000, 4000])(
        'schema accepts custom noten_penalty %d',
        (value) => {
            const result = gameRulesDetailsSchema.safeParse({
                rules: { number_of_players: 4, starting_points: 30000, noten_penalty: value },
            });

            expect(result.success).toBe(true);
        }
    );

    test('schema rejects a noten_penalty that is not a multiple of 100', () => {
        const result = gameRulesDetailsSchema.safeParse({
            rules: { number_of_players: 4, starting_points: 30000, noten_penalty: 1234 },
        });

        expect(result.success).toBe(false);
    });

    test('schema rejects a negative noten_penalty', () => {
        const result = gameRulesDetailsSchema.safeParse({
            rules: { number_of_players: 4, starting_points: 30000, noten_penalty: -1000 },
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

describe('expanded honba enum', () => {
    test('catalog enum is a superset of the original four values', () => {
        const spec = gameRulesCatalogByKey.get('honba');
        expect(spec).toBeDefined();
        expect(spec!.type).toBe('enumString');
        if (spec!.type === 'enumString') {
            for (const original of ['2x100', '3x100', '3x200', '3x500']) {
                expect(spec!.enum).toContain(original);
            }
        }
    });

    test.each([
        ['1x100', 100],
        ['2x100', 100],
        ['2x200', 200],
        ['2x300', 300],
        ['2x500', 500],
        ['3x100', 100],
        ['3x200', 200],
        ['3x300', 300],
        ['3x500', 500],
    ])('schema accepts honba %s and getHonbaValue parses it to %d', (honba, expected) => {
        const result = gameRulesDetailsSchema.safeParse({
            rules: { number_of_players: 4, starting_points: 30000, honba },
        });

        expect(result.success).toBe(true);
        expect(getHonbaValue({ honba } as GameRulesValues)).toBe(expected);
    });

    test('schema rejects an honba value outside the enum', () => {
        const result = gameRulesDetailsSchema.safeParse({
            rules: { number_of_players: 4, starting_points: 30000, honba: '4x100' },
        });

        expect(result.success).toBe(false);
    });
});
