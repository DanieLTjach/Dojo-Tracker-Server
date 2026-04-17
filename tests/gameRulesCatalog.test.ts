import { describe, expect, test } from '@jest/globals';
import { gameRulesCatalog, type RuleSpec } from '../src/data/gameRulesCatalog.ts';

describe('gameRulesCatalog', () => {
    test('has unique rule keys and valid specs', () => {
        const keys = gameRulesCatalog.rules.map(rule => rule.key);

        expect(new Set(keys).size).toBe(keys.length);
        expect(keys.length).toBeGreaterThan(100);

        for (const rule of gameRulesCatalog.rules) {
            expect(rule.key).toMatch(/^[a-z][a-z0-9_]*$/);
            expect(['boolean', 'integer', 'string', 'enumString', 'enumInteger']).toContain(rule.type);
            if (rule.type === 'enumString' || rule.type === 'enumInteger') {
                expect(rule.enum?.length).toBeGreaterThan(0);
            }
        }
    });

    test('constant flag matches single-value enums', () => {
        for (const rule of gameRulesCatalog.rules as readonly RuleSpec[]) {
            const isSingleEnum = rule.enum !== undefined && rule.enum.length === 1;
            if (isSingleEnum) {
                expect(rule.constant).toBe(true);
            } else if (rule.constant) {
                expect(rule.enum?.length).toBe(1);
            }
        }
    });
});
