import { describe, expect, test } from '@jest/globals';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { gameRulesDetailsSchema } from '../src/schema/GameRulesSchemas.ts';

describe('gameRulesDetailsSchema compact format', () => {
    test('accepts compact review files', () => {
        const dir = 'db/data/game-rules-details-compact-review';
        const files = readdirSync(dir).filter(file => /^\d+.*\.json$/.test(file));

        expect(files.length).toBeGreaterThan(0);

        for (const file of files) {
            const details = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
            const result = gameRulesDetailsSchema.safeParse(details);
            expect(result.success).toBe(true);
        }
    });

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
