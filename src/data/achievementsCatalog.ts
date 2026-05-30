// Per-tournament achievement definitions, ported from the reference Python script.
//
// `metric` is a stable identifier persisted in the eventAchievement table and
// returned to the frontend — do not rename existing metrics. Descriptions are in
// Ukrainian to match the rest of the user-facing copy.

export type AchievementValueUnit =
    | 'wins'
    | 'points'
    | 'sticks'
    | 'fu'
    | 'han'
    | 'declarations'
    | 'chombo'
    | 'players';

export interface AchievementDefinition {
    metric: string;
    name: string;
    description: string;
    /** When true the winner is the player with the highest metric value; otherwise the lowest. */
    higherIsBetter: boolean;
    /** Shown after the numeric value, e.g. "5 wins". */
    valueUnit: AchievementValueUnit;
    /** List every player who qualifies (value > 0) instead of just the max/min. */
    listAllQualifiers: boolean;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
    {
        metric: 'dealer_wins',
        name: 'Dice keeper',
        description: 'Найбільше перемог на дилері',
        higherIsBetter: true,
        valueUnit: 'wins',
        listAllQualifiers: false
    },
    {
        metric: 'one_han_wins',
        name: '1-han fan',
        description: 'Найбільше перемог в 1 хан',
        higherIsBetter: true,
        valueUnit: 'wins',
        listAllQualifiers: false
    },
    {
        metric: 'riichi_nomi_wins',
        name: 'Riichi nomi!',
        description: 'Найбільше перемог ріічі-номі',
        higherIsBetter: true,
        valueUnit: 'wins',
        listAllQualifiers: false
    },
    {
        metric: 'mangan_plus_wins_except_yakumans',
        name: 'Go big or go home',
        description: 'Найбільше перемог манган+ (окрім якуманів)',
        higherIsBetter: true,
        valueUnit: 'wins',
        listAllQualifiers: false
    },
    {
        metric: 'thirteen_plus_han_wins',
        name: 'Kazoe sanbaiman',
        description: 'Найбільше перемог з 13+ ханами',
        higherIsBetter: true,
        valueUnit: 'wins',
        listAllQualifiers: false
    },
    {
        metric: 'points_fed_to_dealer',
        name: 'Oya feeder',
        description: 'Найбільша сума очок, відданих дилеру',
        higherIsBetter: true,
        valueUnit: 'points',
        listAllQualifiers: false
    },
    {
        metric: 'lost_riichi_sticks',
        name: 'Riichi stick hater',
        description: 'Найбільша кількість втрачених паличок ріічі',
        higherIsBetter: true,
        valueUnit: 'sticks',
        listAllQualifiers: false
    },
    {
        metric: 'tsumo_wins',
        name: 'Go-getter',
        description: 'Найбільша кількість цумо',
        higherIsBetter: true,
        valueUnit: 'wins',
        listAllQualifiers: false
    },
    {
        metric: 'max_fu_hand',
        name: 'Fu fu fu',
        description: 'Рука з найбільшою кількістю фу',
        higherIsBetter: true,
        valueUnit: 'fu',
        listAllQualifiers: false
    },
    {
        metric: 'haneman_wins',
        name: 'Haneman hunter',
        description: 'Найбільша кількість ханеманів',
        higherIsBetter: true,
        valueUnit: 'wins',
        listAllQualifiers: false
    },
    {
        metric: 'points_lost_on_tsumo',
        name: 'It was not your fault',
        description: 'Найбільша сума очок, втрачених через цумо',
        higherIsBetter: true,
        valueUnit: 'points',
        listAllQualifiers: false
    },
    {
        metric: 'riichi_declarations',
        name: 'I MUST riichi',
        description: 'Найбільша кількість оголошених ріічі',
        higherIsBetter: true,
        valueUnit: 'declarations',
        listAllQualifiers: false
    },
    {
        metric: 'baiman_wins',
        name: 'YABAIman',
        description: 'Найбільше байманів',
        higherIsBetter: true,
        valueUnit: 'wins',
        listAllQualifiers: false
    },
    {
        metric: 'saki_zero_after_uma_games',
        name: 'Saki award',
        description: 'Нуль очок після уми',
        higherIsBetter: true,
        valueUnit: 'players',
        listAllQualifiers: true
    },
    {
        metric: 'chiitoi_nomi_wins',
        name: 'Chiitoi nomi fan',
        description: 'Найбільше перемог 2 хан 25 фу',
        higherIsBetter: true,
        valueUnit: 'wins',
        listAllQualifiers: false
    },
    {
        metric: 'points_lost_on_ron',
        name: 'Defence award',
        description: 'Найменше очок, втрачених на рон',
        higherIsBetter: false,
        valueUnit: 'points',
        listAllQualifiers: false
    },
    {
        metric: 'best_hanchan_points',
        name: 'Best hanchan award',
        description: 'Найбільше очок, отриманих за один ханчан',
        higherIsBetter: true,
        valueUnit: 'points',
        listAllQualifiers: false
    },
    {
        metric: 'yakuman_wins',
        name: 'It was destiny',
        description: 'Найбільше якуманів',
        higherIsBetter: true,
        valueUnit: 'wins',
        listAllQualifiers: false
    },
    {
        metric: 'best_hand_han_points',
        name: 'That was a big one!',
        description: 'Найкраща рука (найбільша кількість хан)',
        higherIsBetter: true,
        valueUnit: 'han',
        listAllQualifiers: false
    },
    {
        metric: 'chombo_count',
        name: 'Rules are meant to be broken',
        description: 'Найбільша кількість чомбо',
        higherIsBetter: true,
        valueUnit: 'chombo',
        listAllQualifiers: false
    },
    {
        metric: 'worst_single_hand_loss',
        name: 'Ouch! That hurts!',
        description: 'Найбільий накид за турнір',
        higherIsBetter: true,
        valueUnit: 'points',
        listAllQualifiers: false
    }
] as const;

export type AchievementMetric = typeof ACHIEVEMENTS[number]['metric'];
