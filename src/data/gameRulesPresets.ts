import type { GameRulesValues } from './gameRulesCatalog.ts';

export interface GameRulesPresetDef {
    key: string;
    name: string;
    extends?: string;
    internal?: true;
    ownRules: GameRulesValues;
}

export interface GameRulesPreset extends GameRulesPresetDef {
    rules: GameRulesValues;
}

const defaultDef: GameRulesPresetDef = {
    key: 'default',
    name: 'Default',
    internal: true,
    ownRules: {
        after_attaching: true,
        concealed_quad_after_riichi: true,
        concealed_quad_after_riichi_if_changes_hand_structure: false,
        concealed_quad_after_riichi_if_changes_yaku: true,
        continuance_payment_pao: 'discarder',
        continuation: 'tenpai',
        dora: true,
        double_ron: 'yes',
        furiten_riichi: true,
        kan_dora: true,
        kan_dora_concealed_quad: 'before_discard',
        kan_ura_dora: true,
        last_tile_draw_after_a_quad: false,
        liability_payment: 'big_dragons_big_winds',
        nb_quads_max: 4,
        oka: 0,
        open_riichi: false,
        open_tanyao: true,
        remaining_riichi_deposits: 'final_winner',
        riichi_deposits_payment_on_multiple_ron: 'bump',
        riichi_on_the_last_tile: false,
        shape_tenpai: true,
        swap_calling: 'hard',
        temporary_furiten_duration: 'players_discard',
        tenpai_with_fifth_tile_in_own_hand: false,
        tenpai_yame: 'no',
        thirteen_orphans_allows_to_rob_a_concealed_quad: true,
        triple_ron: 'yes',
        two_han_minimum: false,
        ura_dora: true,
    }
};

const ema2025Def: GameRulesPresetDef = {
    key: 'ema_2025',
    name: 'EMA 2025',
    extends: 'default',
    ownRules: {
        abortive_draw: false,
        agari_yame: 'no',
        bankrupt: 'none',
        blessing_of_man: 'mangan',
        call_precedence: 'ron_first',
        chombo: 'twenty_thousand_after_uma',
        continuance_payment_on_multiple_ron: 'all',
        counted_yakuman: false,
        double_wind_fu: 'two_fu',
        double_yakuman: false,
        honba: '3x100',
        kan_dora_called_promoted_quad: 'before_discard',
        mangan_rounding_up: true,
        nagashi_mangan: false,
        noten_penalty: 3000,
        number_of_players: 4,
        red_fives: 'none',
        riichi_without_a_next_draw: true,
        starting_points: 0,
        west_round: false,
        yakuman_stacking: false,
    }
};

const mahjongSoulDef: GameRulesPresetDef = {
    key: 'mahjong_soul',
    name: 'Mahjong Soul',
    extends: 'default',
    ownRules: {
        abortive_draw: true,
        agari_yame: 'rank_1',
        automatic_agari_tenpai_yame: true,
        bankrupt: 'below_zero',
        blessing_of_man: 'none',
        call_precedence: 'ron_pon',
        continuance_payment_on_multiple_ron: 'bump',
        continuation_when_abortion: true,
        counted_yakuman: true,
        double_wind_fu: 'four_fu',
        double_yakuman: true,
        goal: 30000,
        honba: '3x100',
        kan_dora_called_promoted_quad: 'after_discard',
        mangan_rounding_up: false,
        nagashi_mangan: true,
        nagashi_mangan_count_as_a_win: false,
        noten_penalty: 3000,
        number_of_players: 4,
        red_fives: 'three_one_per_suit',
        riichi_1000_points_min: true,
        riichi_without_a_next_draw: false,
        starting_points: 25000,
        west_round: true,
        yakuman_stacking: true,
    }
};

const mahjongSoulSanmaDef: GameRulesPresetDef = {
    key: 'mahjong_soul_sanma',
    name: 'Mahjong Soul Sanma',
    extends: 'mahjong_soul',
    ownRules: {
        can_call_kita: true,
        furiten_from_kita: false,
        goal: 40000,
        honba: '2x100',
        kita_after_pon: false,
        north_as_yaku: false,
        noten_penalty: 2000,
        number_of_players: 3,
        red_fives: 'two_red_fives_five_pin_and_five_sou',
        rinshan_from_kita: true,
        ron_on_kita: 'yes_without_chankan',
        starting_points: 35000,
    }
};

const gameRulesPresetDefs = [
    defaultDef,
    ema2025Def,
    mahjongSoulDef,
    mahjongSoulSanmaDef,
] as const;

export function buildGameRulesPresets(defs: readonly GameRulesPresetDef[]): readonly GameRulesPreset[] {
    const defsByKey = new Map<string, GameRulesPresetDef>();
    for (const def of defs) {
        if (defsByKey.has(def.key)) {
            throw new Error(`Duplicate game-rules preset key "${def.key}"`);
        }
        defsByKey.set(def.key, def);
    }

    const resolvedByKey = new Map<string, GameRulesValues>();

    function resolve(def: GameRulesPresetDef, seen = new Set<string>()): GameRulesValues {
        const cached = resolvedByKey.get(def.key);
        if (cached) return cached;
        if (seen.has(def.key)) {
            throw new Error(`Cycle in game-rules preset chain at "${def.key}"`);
        }

        const nextSeen = new Set(seen);
        nextSeen.add(def.key);

        let resolvedRules: GameRulesValues;
        if (!def.extends) {
            resolvedRules = { ...def.ownRules };
        } else {
            const parent = defsByKey.get(def.extends);
            if (!parent) {
                throw new Error(`Preset "${def.key}" extends unknown "${def.extends}"`);
            }
            resolvedRules = { ...resolve(parent, nextSeen), ...def.ownRules };
        }

        resolvedByKey.set(def.key, resolvedRules);
        return resolvedRules;
    }

    return defs.map(def => {
        const preset: GameRulesPreset = {
            key: def.key,
            name: def.name,
            ownRules: { ...def.ownRules },
            rules: resolve(def),
        };

        if (def.extends) {
            preset.extends = def.extends;
        }
        if (def.internal) {
            preset.internal = true;
        }

        return preset;
    });
}

export const gameRulesPresets: readonly GameRulesPreset[] = buildGameRulesPresets(gameRulesPresetDefs);

export const gameRulesPresetsByKey = new Map(gameRulesPresets.map(preset => [preset.key, preset]));
