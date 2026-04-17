import { describe, expect, test } from '@jest/globals';
import { gameRulesDetailsSchema } from '../src/schema/GameRulesSchemas.ts';
import { gameRulesPresets } from '../src/data/gameRulesPresets.ts';
import { gameRulesCatalogByKey } from '../src/data/gameRulesCatalog.ts';

describe('gameRulesDetailsSchema compact format', () => {
    test('rejects unknown canonical rule keys', () => {
        const result = gameRulesDetailsSchema.safeParse({
            rules: {
                number_of_players: 4,
                starting_points: 30000,
                made_up_rule: true
            }
        });

        expect(result.success).toBe(false);
    });

    test('rejects wrong rule value type', () => {
        const result = gameRulesDetailsSchema.safeParse({
            rules: {
                number_of_players: '4',
                starting_points: 30000
            }
        });

        expect(result.success).toBe(false);
    });

    test('rejects clubRules entry missing Ukrainian text', () => {
        const result = gameRulesDetailsSchema.safeParse({
            rules: {
                number_of_players: 4,
                starting_points: 30000
            },
            clubRules: [
                {
                    key: 'house_yaku_tanuki',
                    category: 'yaku',
                    value: 1,
                    name: { en: 'Tanuki' }
                }
            ]
        });

        expect(result.success).toBe(false);
    });

    test('rejects duplicate clubRules keys', () => {
        const result = gameRulesDetailsSchema.safeParse({
            rules: {
                number_of_players: 4,
                starting_points: 30000
            },
            clubRules: [
                {
                    key: 'house_yaku_tanuki',
                    category: 'yaku',
                    value: 1,
                    name: { uk: 'Танукі' }
                },
                {
                    key: 'house_yaku_tanuki',
                    category: 'yaku',
                    value: 2,
                    name: { uk: 'Танукі 2' }
                }
            ]
        });

        expect(result.success).toBe(false);
    });
});

describe('preset validation', () => {
    test('accepts preset with overrides only (required keys satisfied by preset)', () => {
        const result = gameRulesDetailsSchema.safeParse({
            preset: 'ema_2025',
            rules: { starting_points: 25000, red_fives: 'three_one_per_suit' }
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.rules['starting_points']).toBe(25000);
            expect(result.data.rules['red_fives']).toBe('three_one_per_suit');
        }
    });

    test('accepts preset with empty rules', () => {
        const result = gameRulesDetailsSchema.safeParse({
            preset: 'ema_2025',
            rules: {}
        });

        expect(result.success).toBe(true);
    });

    test('rejects unknown preset', () => {
        const result = gameRulesDetailsSchema.safeParse({
            preset: 'unknown_preset',
            rules: {}
        });

        expect(result.success).toBe(false);
    });

    test('rejects internal preset', () => {
        const result = gameRulesDetailsSchema.safeParse({
            preset: 'default',
            rules: {}
        });

        expect(result.success).toBe(false);
    });

    test('rejects preset with invalid override value type', () => {
        const result = gameRulesDetailsSchema.safeParse({
            preset: 'ema_2025',
            rules: { open_tanyao: 'yes' }
        });

        expect(result.success).toBe(false);
    });

    test('rejects preset with unknown rule key', () => {
        const result = gameRulesDetailsSchema.safeParse({
            preset: 'ema_2025',
            rules: { made_up_rule: true }
        });

        expect(result.success).toBe(false);
    });

    test('without preset, required keys must be present', () => {
        const result = gameRulesDetailsSchema.safeParse({
            rules: { open_tanyao: true }
        });

        expect(result.success).toBe(false);
    });

    test('accepts all public presets with their full rules', () => {
        for (const preset of gameRulesPresets.filter(candidate => !candidate.internal)) {
            const result = gameRulesDetailsSchema.safeParse({
                preset: preset.key,
                rules: preset.rules
            });

            expect(result.success).toBe(true);
        }
    });
});

describe('preset values match catalog constraints', () => {
    for (const preset of gameRulesPresets) {
        test(`${preset.key} values are valid per catalog`, () => {
            for (const [key, value] of Object.entries(preset.rules)) {
                const spec = gameRulesCatalogByKey.get(key as never);
                expect(spec).toBeDefined();

                if (spec!.type === 'boolean') {
                    expect(typeof value).toBe('boolean');
                } else if (spec!.type === 'integer') {
                    expect(typeof value).toBe('number');
                    expect(Number.isInteger(value)).toBe(true);
                } else if (spec!.type === 'enumString') {
                    expect(spec!.enum).toContain(value);
                } else if (spec!.type === 'enumInteger') {
                    expect(spec!.enum).toContain(value);
                }
            }
        });

        test(`${preset.key} keys are all known catalog keys`, () => {
            for (const key of Object.keys(preset.rules)) {
                expect(gameRulesCatalogByKey.has(key as never)).toBe(true);
            }
        });
    }
});
