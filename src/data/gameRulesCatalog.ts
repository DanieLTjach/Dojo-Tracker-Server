import type { RuleValue } from '../model/EventModels.ts';

interface RuleSpecBase {
    key: string;
    required?: boolean;
}

interface BooleanRuleSpec extends RuleSpecBase {
    type: 'boolean';
}

interface StringRuleSpec extends RuleSpecBase {
    type: 'string';
}

interface IntegerRuleSpec extends RuleSpecBase {
    type: 'integer';
    min?: number;
    max?: number;
    multipleOf?: number;
}

interface EnumStringRuleSpec extends RuleSpecBase {
    type: 'enumString';
    enum: readonly string[];
}

interface EnumIntegerRuleSpec extends RuleSpecBase {
    type: 'enumInteger';
    enum: readonly number[];
}

export type RuleSpec =
    | BooleanRuleSpec
    | StringRuleSpec
    | IntegerRuleSpec
    | EnumStringRuleSpec
    | EnumIntegerRuleSpec;

export type RuleSpecType = RuleSpec['type'];

export interface GameRulesCatalog {
    rules: readonly RuleSpec[];
}

export const gameRulesCatalog = {
    rules: [
        { key: 'abortive_draw', type: 'boolean' },
        { key: 'after_attaching', type: 'boolean' },
        { key: 'agari_yame', type: 'enumString', enum: ['no','rank_1','rank_1_2'] },
        { key: 'apply_if_other_yakuman', type: 'boolean' },
        { key: 'automatic_agari_tenpai_yame', type: 'boolean' },
        { key: 'bankrupt', type: 'enumString', enum: ['none','below_zero','zero_or_less'] },
        { key: 'blessing_of_man', type: 'enumString', enum: ['none','mangan','yakuman'] },
        { key: 'call_precedence', type: 'enumString', enum: ['first','ron_first','ron_pon','sec3','sec05'] },
        { key: 'chi', type: 'boolean' },
        { key: 'chombo', type: 'enumString', enum: ['twenty_thousand_after_uma'] },
        { key: 'concealed_quad_after_riichi', type: 'boolean' },
        { key: 'concealed_quad_after_riichi_if_changes_hand_structure', type: 'boolean' },
        { key: 'concealed_quad_after_riichi_if_changes_yaku', type: 'boolean' },
        { key: 'continuance_payment', type: 'enumString', enum: ['all','bump'] },
        { key: 'continuance_payment_pao', type: 'enumString', enum: ['feeder','discarder'] },
        { key: 'continuation', type: 'enumString', enum: ['agari','tenpai'] },
        { key: 'continuation_when_abortion', type: 'boolean' },
        { key: 'counted_yakuman', type: 'boolean' },
        { key: 'dora', type: 'boolean' },
        { key: 'double_riichi', type: 'enumString', enum: ['1+1','2'] },
        { key: 'double_ron', type: 'enumString', enum: ['yes','head_bump','first','cancel'] },
        { key: 'double_wind_fu', type: 'enumString', enum: ['two_fu','four_fu'] },
        { key: 'double_yakuman', type: 'boolean' },
        { key: 'eight_consecutive_wins', type: 'boolean' },
        { key: 'furiten_riichi', type: 'boolean' },
        { key: 'goal', type: 'integer', min: 0, multipleOf: 100 },
        { key: 'honba', type: 'enumString', enum: ['2x100','3x100','3x200','3x500'] },
        { key: 'if_changes_wait', type: 'boolean' },
        { key: 'in_case_of_tie', type: 'enumString', enum: ['divide','head_bump'] },
        { key: 'kan_dora', type: 'boolean' },
        { key: 'kan_dora_called_promoted_quad', type: 'enumString', enum: ['before_discard','after_discard'] },
        { key: 'kan_dora_concealed_quad', type: 'enumString', enum: ['before_discard','after_discard'] },
        { key: 'kan_ura_dora', type: 'boolean' },
        { key: 'kiriage_mangan', type: 'boolean' },
        { key: 'kita_after_pon', type: 'boolean' },
        { key: 'kita_and_furiten', type: 'enumString', enum: ['no_effect'] },
        { key: 'last_tile_draw_after_a_quad', type: 'boolean' },
        { key: 'liability_payment', type: 'enumString', enum: ['none','big_dragons_big_winds'] },
        { key: 'mangan_rounding_up', type: 'boolean' },
        { key: 'max_points', type: 'integer', min: 0 },
        { key: 'minimum_games_for_rating', type: 'integer', min: 0 },
        { key: 'nagashi_mangan', type: 'boolean' },
        { key: 'nagashi_mangan_count_as_a_win', type: 'boolean' },
        { key: 'nb_quads_max', type: 'enumInteger', enum: [4] },
        { key: 'north_as_yaku', type: 'enumString', enum: ['no_guest_wind'] },
        { key: 'north_kita_pei', type: 'enumString', enum: ['nukidora'] },
        { key: 'noten_penalty', type: 'enumInteger', enum: [0,2000,3000] },
        { key: 'number_of_players', type: 'enumInteger', enum: [3,4], required: true },
        { key: 'official_starting_points', type: 'integer', min: 0, multipleOf: 100 },
        { key: 'oka', type: 'integer', min: 0 },
        { key: 'open_riichi', type: 'boolean' },
        { key: 'open_tanyao', type: 'boolean' },
        { key: 'pairs_2_to_8_in_the_same_suit', type: 'boolean' },
        { key: 'pinfu_yaku', type: 'boolean' },
        { key: 'red_fives', type: 'enumString', enum: ['none','three_one_per_suit','two_red_fives_five_pin_and_five_sou'] },
        { key: 'remaining_riichi_deposits', type: 'enumString', enum: ['final_winner','take_back','lost'] },
        { key: 'renho', type: 'enumString', enum: ['yakuman'] },
        { key: 'replacement_tile', type: 'boolean' },
        { key: 'riichi_1000_points_min', type: 'boolean' },
        { key: 'riichi_deposits_payment', type: 'enumString', enum: ['bump'] },
        { key: 'riichi_on_the_last_tile', type: 'boolean' },
        { key: 'riichi_without_a_next_draw', type: 'boolean' },
        { key: 'rinshan_from_kita', type: 'boolean' },
        { key: 'ron_on_kita', type: 'enumString', enum: ['yes_without_chankan'] },
        { key: 'shape_tenpai', type: 'boolean' },
        { key: 'starting_points', type: 'integer', min: 0, multipleOf: 100, required: true },
        { key: 'swap_calling', type: 'enumString', enum: ['yes','soft','hard'] },
        { key: 'temporary_furiten_duration', type: 'enumString', enum: ['players_discard','interrupt'] },
        { key: 'tenpai_with_fifth_tile_in_own_hand', type: 'boolean' },
        { key: 'tenpai_yame', type: 'enumString', enum: ['no','rank_1','rank_1_2'] },
        { key: 'thirteen_isolated_tiles', type: 'boolean' },
        { key: 'thirteen_orphans_allows_to_rob_a_concealed_quad', type: 'boolean' },
        { key: 'triple_ron', type: 'enumString', enum: ['yes','head_bump','first','cancel'] },
        { key: 'two_han_minimum', type: 'boolean' },
        { key: 'uma_tie_break', type: 'enumString', enum: ['by_wind','equal_split'] },
        { key: 'ura_dora', type: 'boolean' },
        { key: 'west_round', type: 'boolean' },
        { key: 'yakuman_stacking', type: 'boolean' },
    ],
} as const satisfies GameRulesCatalog;

export const gameRulesCatalogByKey = new Map<GameRuleKey, RuleSpec>(
    gameRulesCatalog.rules.map(rule => [rule.key, rule])
);

export type GameRuleKey = typeof gameRulesCatalog.rules[number]['key'];

export type GameRulesValues = Partial<Record<GameRuleKey, RuleValue>>;
