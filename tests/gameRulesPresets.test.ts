import { describe, expect, test } from '@jest/globals';
import {
    buildGameRulesPresets,
    gameRulesPresets,
    gameRulesPresetsByKey
} from '../src/data/gameRulesPresets.ts';
import type { RuleValue } from '../src/model/EventModels.ts';

function sortRules(rules: Record<string, RuleValue>): Record<string, RuleValue> {
    return Object.fromEntries(
        Object.entries(rules).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    );
}

describe('game rules presets', () => {
    test('public presets resolve to the expected rules snapshot', () => {
        const publicPresets = gameRulesPresets
            .filter(preset => !preset.internal)
            .map(({ key, name, extends: parentPreset, rules, ownRules }) => ({
                key,
                name,
                extends: parentPreset,
                rules: sortRules(rules),
                ownRules: sortRules(ownRules)
            }));

        expect(publicPresets).toMatchSnapshot();
    });

    test('mahjong_soul_sanma resolves through mahjong_soul and default', () => {
        const sanmaPreset = gameRulesPresetsByKey.get('mahjong_soul_sanma');

        expect(sanmaPreset).toBeDefined();
        expect(sanmaPreset!.rules['abortive_draw']).toBe(true);
        expect(sanmaPreset!.rules['automatic_agari_tenpai_yame']).toBe(true);
        expect(sanmaPreset!.rules['open_tanyao']).toBe(true);
    });

    test('internal default preset is hidden from public consumers', () => {
        expect(gameRulesPresetsByKey.get('default')?.internal).toBe(true);
        expect(gameRulesPresets.filter(preset => !preset.internal).map(preset => preset.key)).toEqual([
            'ema_2025',
            'mahjong_soul',
            'mahjong_soul_sanma'
        ]);
    });

    test('throws when preset inheritance contains a cycle', () => {
        expect(() => buildGameRulesPresets([
            { key: 'a', name: 'A', extends: 'b', ownRules: {} },
            { key: 'b', name: 'B', extends: 'a', ownRules: {} }
        ])).toThrow('Cycle in game-rules preset chain at "a"');
    });

    test('throws when preset inheritance references a missing parent', () => {
        expect(() => buildGameRulesPresets([
            { key: 'a', name: 'A', extends: 'missing', ownRules: {} }
        ])).toThrow('Preset "a" extends unknown "missing"');
    });
});
