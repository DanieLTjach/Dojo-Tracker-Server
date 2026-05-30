import { computeAchievements, type AchievementGameInput } from '../src/util/AchievementCalculator.ts';
import type { ComputedAchievement } from '../src/model/AchievementModels.ts';
import type { GameRoundResult } from '../src/model/GameRoundResultModels.ts';
import type { PlayerPointChange } from '../src/model/GameRoundResultModels.ts';

function tsumo(
    winner: number,
    han: number,
    fu: number,
    riichi: number[],
    pointChanges: Record<number, number>
): GameRoundResult {
    return {
        type: 'TSUMO',
        winningHandData: { winnerPlayerId: winner, yakumanCount: 0, han, fu },
        riichiPlayerIds: riichi,
        playerPointChanges: toChanges(pointChanges),
        nextState: undefined,
        gameFinishReason: undefined
    };
}

function ron(
    winner: number,
    dealInPlayerId: number,
    han: number,
    fu: number,
    riichi: number[],
    pointChanges: Record<number, number>
): GameRoundResult {
    return {
        type: 'RON',
        dealInPlayerId,
        winningHandData: [{ winnerPlayerId: winner, yakumanCount: 0, han, fu }],
        riichiPlayerIds: riichi,
        playerPointChanges: toChanges(pointChanges),
        nextState: undefined,
        gameFinishReason: undefined
    };
}

function toChanges(pointChanges: Record<number, number>): PlayerPointChange[] {
    return Object.entries(pointChanges).map(([playerId, pointChange]) => ({
        playerId: Number(playerId),
        pointChange
    }));
}

function find(results: ComputedAchievement[], metric: string): ComputedAchievement {
    const result = results.find((r) => r.metric === metric);
    if (result === undefined) {
        throw new Error(`Achievement ${metric} not produced`);
    }
    return { ...result, winnerUserIds: [...result.winnerUserIds].sort((a, b) => a - b) };
}

describe('computeAchievements', () => {
    // Two-round game: an EAST dealer tsumo, then a SOUTH-round ron by player 3 off player 4.
    const game: AchievementGameInput = {
        players: [
            { userId: 1, points: 40000, startPlace: 'EAST', isSubstitutePlayer: false, chomboCount: 0 },
            { userId: 2, points: 30000, startPlace: 'SOUTH', isSubstitutePlayer: false, chomboCount: 0 },
            { userId: 3, points: 20000, startPlace: 'WEST', isSubstitutePlayer: false, chomboCount: 0 },
            { userId: 4, points: 10000, startPlace: 'NORTH', isSubstitutePlayer: false, chomboCount: 1 }
        ],
        zeroRatingChangeUserIds: [3],
        rounds: [
            { dealerNumber: 1, result: tsumo(1, 2, 30, [1], { 1: 6000, 2: -2000, 3: -2000, 4: -2000 }) },
            { dealerNumber: 2, result: ron(3, 4, 1, 40, [3, 4], { 3: 1300, 4: -1300 }) }
        ]
    };

    const results = computeAchievements([game], true, 15000);

    it('awards dealer and tsumo wins to the dealer who tsumo-ed', () => {
        expect(find(results, 'dealer_wins')).toMatchObject({ value: 1, winnerUserIds: [1] });
        expect(find(results, 'tsumo_wins')).toMatchObject({ value: 1, winnerUserIds: [1] });
    });

    it('awards 1-han and riichi-nomi wins to the riichi ron winner', () => {
        expect(find(results, 'one_han_wins')).toMatchObject({ value: 1, winnerUserIds: [3] });
        expect(find(results, 'riichi_nomi_wins')).toMatchObject({ value: 1, winnerUserIds: [3] });
    });

    it('sums points fed to the dealer on a dealer tsumo', () => {
        expect(find(results, 'points_fed_to_dealer')).toMatchObject({ value: 2000, winnerUserIds: [2, 3, 4] });
    });

    it('tracks the highest fu hand below 5 han', () => {
        // player 3 won with 40 fu, player 1 with 30 fu.
        expect(find(results, 'max_fu_hand')).toMatchObject({ value: 40, winnerUserIds: [3] });
    });

    it('gives the defence award (lowest ron loss) to players who lost nothing on ron', () => {
        expect(find(results, 'points_lost_on_ron')).toMatchObject({ value: 0, winnerUserIds: [1, 2, 3] });
    });

    it('counts lost riichi sticks and worst single-hand loss for the deal-in player', () => {
        expect(find(results, 'lost_riichi_sticks')).toMatchObject({ value: 1, winnerUserIds: [4] });
        expect(find(results, 'worst_single_hand_loss')).toMatchObject({ value: 1300, winnerUserIds: [4] });
    });

    it('lists every saki-award qualifier with the qualifier count as value', () => {
        expect(find(results, 'saki_zero_after_uma_games')).toMatchObject({ value: 1, winnerUserIds: [3] });
    });

    it('awards best hanchan points by raw points', () => {
        expect(find(results, 'best_hanchan_points')).toMatchObject({ value: 40000, winnerUserIds: [1] });
    });

    it('counts chombo from player totals', () => {
        expect(find(results, 'chombo_count')).toMatchObject({ value: 1, winnerUserIds: [4] });
    });

    it('produces no winners for achievements nobody reached', () => {
        expect(find(results, 'yakuman_wins')).toMatchObject({ value: 0, winnerUserIds: [] });
        expect(find(results, 'baiman_wins')).toMatchObject({ value: 0, winnerUserIds: [] });
    });

    it('subtracts the substitute penalty from a substitute player best hanchan', () => {
        const subGame: AchievementGameInput = {
            players: [
                { userId: 1, points: 40000, startPlace: 'EAST', isSubstitutePlayer: true, chomboCount: 0 },
                { userId: 2, points: 30000, startPlace: 'SOUTH', isSubstitutePlayer: false, chomboCount: 0 }
            ],
            zeroRatingChangeUserIds: [],
            rounds: []
        };
        const subResults = computeAchievements([subGame], true, 15000);
        // player 1: 40000 - 15000 = 25000; player 2: 30000 -> player 2 wins.
        expect(find(subResults, 'best_hanchan_points')).toMatchObject({ value: 30000, winnerUserIds: [2] });
    });

    it('produces one result per catalog achievement', () => {
        expect(results).toHaveLength(21);
    });
});
