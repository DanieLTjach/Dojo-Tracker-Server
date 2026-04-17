import type { RuleValue } from '../model/EventModels.ts';

export interface GameRulesPresetDef {
    key: string;
    name: string;
    extends?: string;
    internal?: true;
    ownRules: Record<string, RuleValue>;
}

export interface GameRulesPreset {
    key: string;
    name: string;
    extends?: string;
    internal?: true;
    rules: Record<string, RuleValue>;
    ownRules: Record<string, RuleValue>;
}

const defaultDef: GameRulesPresetDef = {
    key: 'default',
    name: 'Default',
    internal: true,
    ownRules: {
        after_a_quad: 1,
        after_attaching: true,
        all_green: 1,
        all_green_must_have_green_dragon: false,
        all_honours: 1,
        all_inside: 1,
        all_triplets: 2,
        apply_if_other_yakuman: true,
        big_dragons: 1,
        blessing_of_earth: 1,
        blessing_of_heaven: 1,
        common_ends: '2/1',
        common_flush: '3/2',
        common_terminals: '2+2',
        concealed_quad: 'sixteen_thirty_two_fu',
        concealed_quad_after_riichi: true,
        concealed_sequence: 'zero_zero_fu',
        concealed_triplet: 'four_eight_fu',
        continuance_payment_pao: 'discarder',
        continuance_points: '3x100',
        continuation: 'tenpai',
        dora: true,
        double_riichi: '2',
        double_ron: 'yes',
        double_twin_sequences: 3,
        double_wind: '1+1',
        edge_middle_pair_wait: 'two_fu',
        eight_consecutive_wins: false,
        fifth_tile_in_own_hand: false,
        four_concealed_triplets: 1,
        four_quads: 1,
        full_straight: '2/1',
        fully_concealed_hand: 1,
        furiten_riichi: true,
        if_changes_hand_structure: false,
        if_changes_wait: false,
        if_changes_yaku: true,
        kan_dora: true,
        kan_dora_concealed_quad: 'before',
        kan_ura_dora: true,
        last_tile_claim: 1,
        last_tile_draw: 1,
        last_tile_draw_after_a_quad: false,
        liability_payment: 'big_dragons_big_winds',
        little_dragons: '2+2',
        little_winds: 1,
        max_points: false,
        melded_quad: 'eight_sixteen_fu',
        melded_sequence: 'zero_zero_fu',
        melded_triplet: 'two_four_fu',
        nb_quads_max: 4,
        nine_gates: 1,
        oka: 0,
        on_any_tile: false,
        open_pinfu: 'two_fu',
        open_riichi: false,
        open_tanyao: true,
        other_yakus: false,
        pair: 'zero_zero_fu',
        pairs_2_to_8_in_the_same_suit: false,
        perfect_ends: '3/2',
        perfect_flush: '6/5',
        perfect_terminals: 1,
        pinfu: 1,
        pinfu_yaku: false,
        remaining_riichi_deposits: 'final_winner',
        replacement_tile: true,
        riichi: 1,
        riichi_deposits_payment: 'bump',
        riichi_on_the_last_tile: false,
        robbing_a_quad: 1,
        seven_pairs: 2,
        seven_pairs_fu: 'twenty_five_fu',
        shape_tenpai: true,
        skyrocketing: false,
        swap_calling: 'hard',
        temporary_furiten_duration: 'players_discard',
        thirteen_isolated_tiles: false,
        thirteen_orphans: 1,
        thirteen_orphans_allows_to_rob_a_concealed_quad: true,
        three_concealed_triplets: 2,
        three_quads: 2,
        triple_ron: 'yes',
        triple_triplets: 2,
        twin_sequences: 1,
        two_han_minimum: false,
        unbroken: '1+1',
        ura_dora: true,
        value_honour: 1,
        value_honour_fu: 'two_fu',
        wareme: false,
        winning: 'twenty_fu',
        winning_by_calling_a_tile_on_a_closed_hand: 'ten_fu',
        winning_by_self_draw: 'two_fu',
        winning_plus_2_han: true,
        yakitori: false,
    }
};

const ema2025Def: GameRulesPresetDef = {
    key: 'ema_2025',
    name: 'EMA 2025',
    extends: 'default',
    ownRules: {
        abortive_draw: 'none',
        agari_yame: 'no',
        bankrupt: 'none',
        big_winds: 1,
        blessing_of_man: 'mangan',
        chombo: 'twenty_thousand_after_uma',
        continuance_payment: 'all',
        counted_yakuman: false,
        double_wind_fu_exception: 'two_fu',
        double_yakuman: false,
        four_concealed_triplets_on_the_pair: 1,
        goal: 30000,
        in_case_of_tie: 'divide',
        kan_dora_called_promoted_quad: 'before',
        mangan_rounding_up: true,
        mixed_sequences: '2/1',
        nagashi_mangan: false,
        nine_gates_on_9_waits: 1,
        noten_penalty: 3000,
        number_of_players: 4,
        official_starting_points: 30000,
        precedence: 'ron_first',
        red_fives: 'none',
        riichi_without_a_next_draw: true,
        starting_points: 0,
        tenpai_yame: 'no',
        thirteen_orphans_on_13_waits: 1,
        west_round: false,
        yakuman_stacking: false,
    }
};

const mahjongSoulDef: GameRulesPresetDef = {
    key: 'mahjong_soul',
    name: 'Mahjong Soul',
    extends: 'default',
    ownRules: {
        abortive_draw: 'all',
        agari_yame: 'yes',
        automatic: true,
        bankrupt: 'below_zero',
        big_winds: 2,
        blessing_of_man: 'none',
        continuance_payment: 'bump',
        continuation_when_abortion: true,
        counted_yakuman: true,
        double_wind_fu_exception: 'four_fu',
        double_yakuman: true,
        four_concealed_triplets_on_the_pair: 2,
        goal: 30000,
        in_case_of_tie: 'head_bump',
        kan_dora_called_promoted_quad: 'after_discard',
        mangan_rounding_up: false,
        mixed_sequences: '2/1',
        nagashi_mangan: true,
        nagashi_mangan_count_as_a_win: false,
        nine_gates_on_9_waits: 2,
        noten_penalty: 3000,
        number_of_players: 4,
        precedence: 'ron_pon',
        red_fives: 'three_one_per_suit',
        riichi_1000_points_min: 'required',
        riichi_without_a_next_draw: false,
        starting_points: 25000,
        tenpai_yame: 'yes',
        thirteen_orphans_on_13_waits: 2,
        west_round: true,
        yakuman_stacking: true,
    }
};

const mahjongSoulSanmaDef: GameRulesPresetDef = {
    key: 'mahjong_soul_sanma',
    name: 'Mahjong Soul Sanma',
    extends: 'mahjong_soul',
    ownRules: {
        abortive_draw: 'four_kans_nine_terminals',
        goal: 40000,
        mixed_sequences: 'no_manzu',
        noten_penalty: 2000,
        number_of_players: 3,
        red_fives: 'two_red_fives_five_pin_and_north',
        starting_points: 35000,
        chi: false,
        removed_tiles: 'two_to_eight_manzu',
        dora_after_1_manzu: 'nine_manzu',
        scoring: 'tsumo_loss_ranked',
        rinshan_tiles: 8,
        north_kita_pei: 'nukidora',
        kita_after_pon: false,
        kita_cancels: 'ippatsu_chiho_kyushu_double_riichi',
        rinshan_from_kita: true,
        ron_on_kita: 'yes_without_chankan',
        kita_and_furiten: 'no_effect',
        north_as_yaku: 'no_guest_wind',
        honba: '2x100',
        suufuu_suucha: 'no_three_players',
        target_points: 40000,
        uma_tie_break: 'by_wind',
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

    const resolvedByKey = new Map<string, Record<string, RuleValue>>();

    function resolve(def: GameRulesPresetDef, seen = new Set<string>()): Record<string, RuleValue> {
        const cached = resolvedByKey.get(def.key);
        if (cached) return cached;
        if (seen.has(def.key)) {
            throw new Error(`Cycle in game-rules preset chain at "${def.key}"`);
        }

        const nextSeen = new Set(seen);
        nextSeen.add(def.key);

        let resolvedRules: Record<string, RuleValue>;
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
            rules: resolve(def),
            ownRules: { ...def.ownRules },
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
