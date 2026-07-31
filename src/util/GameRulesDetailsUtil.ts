import { gameRulesPresetsByKey } from '../data/gameRulesPresets.ts';
import type { GameRulesDetails } from '../model/EventModels.ts';

interface GameRulesCoreValues {
    numberOfPlayers: number;
    startingPoints: number;
}

export function parseGameRulesDetailsAndApplyPresets(
    details: string | null,
    core?: GameRulesCoreValues
): GameRulesDetails | null {
    if (!details) return null;

    const parsed: GameRulesDetails = JSON.parse(details);
    const presetRules = parsed.preset
        ? gameRulesPresetsByKey.get(parsed.preset)?.rules ?? {}
        : {};

    return {
        ...parsed,
        rules: {
            ...presetRules,
            ...parsed.rules,
            ...(core
                ? {
                    number_of_players: core.numberOfPlayers as 3 | 4,
                    starting_points: core.startingPoints,
                }
                : {}),
        },
    };
}
