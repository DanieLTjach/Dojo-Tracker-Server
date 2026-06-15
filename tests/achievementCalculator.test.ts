import { computeAchievements } from '../src/util/AchievementCalculator.ts';
import type { ComputedAchievement } from '../src/model/AchievementModels.ts';
import type { GameRoundResult } from '../src/model/GameRoundResultModels.ts';
import type { PlayerPointChange } from '../src/model/GameRoundResultModels.ts';
import { GameStatus, Wind, type DetailedGame, type GamePlayer, type GameRound } from '../src/model/GameModels.ts';

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

function player(
    userId: number,
    points: number,
    startPlace: Wind,
    opts: { isSubstitutePlayer?: boolean; chomboCount?: number; ratingChange?: number } = {}
): GamePlayer {
    return {
        gameId: 1,
        userId,
        name: `player-${userId}`,
        telegramUsername: null,
        profileFirstName: null,
        profileLastName: null,
        profileHidden: false,
        points,
        ratingChange: opts.ratingChange ?? 10,
        startPlace,
        chomboCount: opts.chomboCount ?? 0,
        isSubstitutePlayer: opts.isSubstitutePlayer ?? false
    };
}

function gameRound(roundNumber: number, dealerNumber: number, result: GameRoundResult): GameRound {
    return {
        gameId: 1,
        roundNumber,
        wind: Wind.EAST,
        dealerNumber,
        counters: 0,
        riichiSticks: 0,
        result
    };
}

function detailedGame(players: GamePlayer[], rounds: GameRound[]): DetailedGame {
    const ts = new Date('2025-01-01T00:00:00.000Z');
    return {
        id: 1,
        eventId: 1,
        createdAt: ts,
        modifiedAt: ts,
        modifiedBy: 0,
        tournamentRound: null,
        tournamentTable: null,
        status: GameStatus.FINISHED,
        startedAt: ts,
        endedAt: ts,
        lastRoundWasDeleted: false,
        players,
        rounds,
        currentState: null
    };
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
    const game = detailedGame(
        [
            player(1, 40000, Wind.EAST),
            player(2, 30000, Wind.SOUTH),
            player(3, 20000, Wind.WEST, { ratingChange: 0 }),
            player(4, 10000, Wind.NORTH, { chomboCount: 1 })
        ],
        [
            gameRound(1, 1, tsumo(1, 2, 30, [1], { 1: 6000, 2: -2000, 3: -2000, 4: -2000 })),
            gameRound(2, 2, ron(3, 4, 1, 40, [3, 4], { 3: 1300, 4: -1300 }))
        ]
    );

    const results = computeAchievements([game], {});

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
        expect(find(results, 'biggest_deal_in')).toMatchObject({ value: 1300, winnerUserIds: [4] });
    });

    it('lists every saki-award qualifier without a headline value', () => {
        const saki = find(results, 'saki_zero_after_uma_games');
        expect(saki.value).toBeUndefined();
        expect(saki.winnerUserIds).toEqual([3]);
    });

    it('awards best game points by raw points', () => {
        expect(find(results, 'best_game_points')).toMatchObject({ value: 40000, winnerUserIds: [1] });
    });

    it('counts chombo from player totals', () => {
        expect(find(results, 'chombo_count')).toMatchObject({ value: 1, winnerUserIds: [4] });
    });

    it('produces no winners and no value for achievements nobody reached', () => {
        const yakuman = find(results, 'yakuman_wins');
        expect(yakuman.value).toBeUndefined();
        expect(yakuman.winnerUserIds).toEqual([]);
        const baiman = find(results, 'baiman_wins');
        expect(baiman.value).toBeUndefined();
        expect(baiman.winnerUserIds).toEqual([]);
    });

    it('subtracts the substitute penalty from a substitute player best game', () => {
        const subGame = detailedGame(
            [
                player(1, 40000, Wind.EAST, { isSubstitutePlayer: true }),
                player(2, 30000, Wind.SOUTH)
            ],
            []
        );
        const subResults = computeAchievements([subGame], { substitute_player_penalty_before_uma: 15000 });
        // player 1: 40000 - 15000 = 25000; player 2: 30000 -> player 2 wins.
        expect(find(subResults, 'best_game_points')).toMatchObject({ value: 30000, winnerUserIds: [2] });
    });

    it('produces one result per catalog achievement', () => {
        expect(results).toHaveLength(21);
    });
});
