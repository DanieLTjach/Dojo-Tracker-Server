// `metric` is a stable identifier persisted in the eventAchievement table and
// returned to the frontend — do not rename existing metrics.

import { AchievementCriterion } from '../model/AchievementModels.ts';

export type AchievementValueUnit =
    | 'wins'
    | 'points'
    | 'sticks'
    | 'fu'
    | 'han'
    | 'declarations'
    | 'chombo'
    | 'players';

export interface PlayerStats {
    dealer_wins: number;
    one_han_wins: number;
    riichi_nomi_wins: number;
    mangan_plus_wins_except_yakumans: number;
    thirteen_plus_han_wins: number;
    points_fed_to_dealer: number;
    lost_riichi_sticks: number;
    tsumo_wins: number;
    max_fu_hand: number;
    haneman_wins: number;
    points_lost_on_tsumo: number;
    riichi_declarations: number;
    baiman_wins: number;
    saki_zero_after_uma_games: number;
    chiitoi_nomi_wins: number;
    points_lost_on_ron: number;
    best_game_points: number;
    yakuman_wins: number;
    best_hand_han_points: number;
    chombo_count: number;
    biggest_deal_in: number;
}

export type AchievementMetric = keyof PlayerStats;

export interface AchievementDefinition {
    metric: AchievementMetric;
    name: string;
    description: string;
    criterion: AchievementCriterion;
    /** Shown after the numeric value, e.g. "5 wins". */
    valueUnit: AchievementValueUnit;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
    {
        metric: 'dealer_wins',
        name: 'Dice keeper',
        description: 'Найбільше перемог на дилері',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'wins'
    },
    {
        metric: 'one_han_wins',
        name: '1-han fan',
        description: 'Найбільше перемог в 1 хан',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'wins'
    },
    {
        metric: 'riichi_nomi_wins',
        name: 'Riichi nomi!',
        description: 'Найбільше перемог ріічі-номі',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'wins'
    },
    {
        metric: 'mangan_plus_wins_except_yakumans',
        name: 'Go big or go home',
        description: 'Найбільше перемог манган+ (окрім якуманів)',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'wins'
    },
    {
        metric: 'thirteen_plus_han_wins',
        name: 'Kazoeman',
        description: 'Найбільше перемог з 13+ ханами',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'wins'
    },
    {
        metric: 'points_fed_to_dealer',
        name: 'Oya feeder',
        description: 'Найбільша сума очок, відданих дилеру',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'points'
    },
    {
        metric: 'lost_riichi_sticks',
        name: 'Riichi stick hater',
        description: 'Найбільша кількість втрачених паличок ріічі',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'sticks'
    },
    {
        metric: 'tsumo_wins',
        name: 'Go-getter',
        description: 'Найбільша кількість цумо',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'wins'
    },
    {
        metric: 'max_fu_hand',
        name: 'Fu fu fu',
        description: 'Рука з найбільшою кількістю фу',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'fu'
    },
    {
        metric: 'haneman_wins',
        name: 'Haneman hunter',
        description: 'Найбільша кількість ханеманів',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'wins'
    },
    {
        metric: 'points_lost_on_tsumo',
        name: 'It was not your fault',
        description: 'Найбільша сума очок, втрачених через цумо',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'points'
    },
    {
        metric: 'riichi_declarations',
        name: 'I MUST riichi',
        description: 'Найбільша кількість оголошених ріічі',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'declarations'
    },
    {
        metric: 'baiman_wins',
        name: 'YABAIman',
        description: 'Найбільше байманів',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'wins'
    },
    {
        metric: 'saki_zero_after_uma_games',
        name: 'Saki award',
        description: 'Нуль очок після уми',
        criterion: AchievementCriterion.AllQualifiers,
        valueUnit: 'players'
    },
    {
        metric: 'chiitoi_nomi_wins',
        name: 'Chiitoi nomi fan',
        description: 'Найбільше перемог 2 хан 25 фу',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'wins'
    },
    {
        metric: 'points_lost_on_ron',
        name: 'Defence award',
        description: 'Найменше очок, втрачених на рон',
        criterion: AchievementCriterion.Lowest,
        valueUnit: 'points'
    },
    {
        metric: 'best_game_points',
        name: 'Best game award',
        description: 'Найбільше очок, отриманих за одну гру',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'points'
    },
    {
        metric: 'yakuman_wins',
        name: 'It was destiny',
        description: 'Найбільше якуманів',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'wins'
    },
    {
        metric: 'best_hand_han_points',
        name: 'That was a big one!',
        description: 'Найкраща рука (найбільша кількість хан)',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'han'
    },
    {
        metric: 'chombo_count',
        name: 'Rules are meant to be broken',
        description: 'Найбільша кількість чомбо',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'chombo'
    },
    {
        metric: 'biggest_deal_in',
        name: 'Ouch! That hurts!',
        description: 'Найбільший накид за турнір',
        criterion: AchievementCriterion.Highest,
        valueUnit: 'points'
    }
] as const;

export function newStats(): PlayerStats {
    return {
        dealer_wins: 0,
        one_han_wins: 0,
        riichi_nomi_wins: 0,
        mangan_plus_wins_except_yakumans: 0,
        thirteen_plus_han_wins: 0,
        points_fed_to_dealer: 0,
        lost_riichi_sticks: 0,
        tsumo_wins: 0,
        max_fu_hand: 0,
        haneman_wins: 0,
        points_lost_on_tsumo: 0,
        riichi_declarations: 0,
        baiman_wins: 0,
        saki_zero_after_uma_games: 0,
        chiitoi_nomi_wins: 0,
        points_lost_on_ron: 0,
        best_game_points: 0,
        yakuman_wins: 0,
        best_hand_han_points: 0,
        chombo_count: 0,
        biggest_deal_in: 0
    };
}
