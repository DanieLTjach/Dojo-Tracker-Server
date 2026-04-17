import { gameRulesPresetsByKey } from '../data/gameRulesPresets.ts';
import type { GameRulesDetails } from '../model/EventModels.ts';

export function parseStoredGameRulesDetails(details: string | null): GameRulesDetails | null {
    if (!details) return null;

    const parsed: GameRulesDetails = JSON.parse(details);
    if (!parsed.preset) return parsed;

    const preset = gameRulesPresetsByKey.get(parsed.preset);
    if (!preset) return parsed;

    return {
        ...parsed,
        rules: { ...preset.rules, ...parsed.rules }
    };
}
