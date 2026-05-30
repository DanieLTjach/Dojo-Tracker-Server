import type { GameRulesValues } from "../data/gameRulesCatalog.ts";
import { InvalidHonbaFormatError } from "../error/PointCalculationErrors.ts";

export function getNumberOfPlayers(rules: GameRulesValues): 3 | 4 {
    return rules.number_of_players ?? 4;
}

export function getContinuancePaymentOnMultipleRon(rules: GameRulesValues): "all" | "bump" {
    return rules.continuance_payment_on_multiple_ron ?? "all";
}

export function getDoubleRonHandling(rules: GameRulesValues): "yes" | "head_bump" | "first" {
    return rules.double_ron ?? "yes";
}

export function getTripleRonHandling(rules: GameRulesValues): "yes" | "head_bump" | "first" | "cancel" {
    return rules.triple_ron ?? "yes";
}

export function getContinuancePaymentPao(rules: GameRulesValues): "feeder" | "discarder" {
    return rules.continuance_payment_pao ?? "discarder";
}

export function isRiichiDepositReturnedIfOneOfMultipleRon(rules: GameRulesValues): boolean {
    return rules.riichi_deposit_is_returned_if_one_of_multiple_ron ?? true;
}

export function isNagashiManganEnabled(rules: GameRulesValues): boolean {
    return rules.nagashi_mangan ?? false;
}

export function isNagashiManganCountedAsAWinEnabled(rules: GameRulesValues): boolean {
    return rules.nagashi_mangan_count_as_a_win ?? false;
}

export function getNotenPenalty(rules: GameRulesValues): number {
    return rules.noten_penalty ?? 1000 * (getNumberOfPlayers(rules) - 1);
}

export function getChomboHandling(rules: GameRulesValues): "twenty_thousand_after_uma" | "mangan" {
    return rules.chombo ?? "twenty_thousand_after_uma";
}

export function getSubstitutePlayerPenaltyBeforeUma(rules: GameRulesValues): number {
    return rules.substitute_player_penalty_before_uma ?? 0;
}

export function getSubstitutePlayerUma(rules: GameRulesValues): number | undefined {
    return rules.substitute_player_uma;
}

export function isYakumanStackingEnabled(rules: GameRulesValues): boolean {
    return rules.yakuman_stacking ?? false;
}

export function isCountedYakumanEnabled(rules: GameRulesValues): boolean {
    return rules.counted_yakuman ?? false;
}

export function isManganRoundingUpEnabled(rules: GameRulesValues): boolean {
    return rules.mangan_rounding_up ?? true;
}

export function getBankruptHandling(rules: GameRulesValues): "none" | "below_zero" | "zero_or_less" {
    return rules.bankrupt ?? "none";
}

export function getMaxPoints(rules: GameRulesValues): number | undefined {
    return rules.max_points;
}

export function getTenpaiYame(rules: GameRulesValues): "no" | "rank_1" | "rank_1_2" {
    return rules.tenpai_yame ?? "no";
}

export function getAgariYame(rules: GameRulesValues): "no" | "rank_1" | "rank_1_2" {
    return rules.agari_yame ?? "no";
}

export function isAutomaticAgariTenpaiYameEnabled(rules: GameRulesValues): boolean {
    return rules.automatic_agari_tenpai_yame ?? true;
}

export function isTwoHanMinimumEnabled(rules: GameRulesValues): boolean {
    return rules.two_han_minimum ?? false;
}

export function isWestRoundEnabled(rules: GameRulesValues): boolean {
    return rules.west_round ?? false;
}

export function getContinuation(rules: GameRulesValues): "agari" | "tenpai" {
    return rules.continuation ?? "tenpai";
}

export function isContinuationWhenAbortionEnabled(rules: GameRulesValues): boolean {
    return rules.continuation_when_abortion ?? true;
}

export function getRemainingRiichiDeposits(rules: GameRulesValues): "final_winner" | "lost" {
    return rules.remaining_riichi_deposits ?? "final_winner";
}

export function isAbortiveDrawEnabled(rules: GameRulesValues): boolean {
    return rules.abortive_draw ?? false;
}

export function getHonbaValue(rules: GameRulesValues): number {
    if (rules.honba === undefined) {
        return 100;
    }

    const parts = rules.honba.split('x');
    if (parts.length !== 2) {
        throw new InvalidHonbaFormatError();
    }

    const value = parseInt(parts[1]!, 10);
    if (isNaN(value)) {
        throw new InvalidHonbaFormatError();
    }

    return value;
}
