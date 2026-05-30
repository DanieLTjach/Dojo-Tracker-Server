// Pure port of the reference Python achievement calculator.
//
// Operates on user ids only (display names are resolved later, on read). Faithful
// to the Python: it throws on inconsistent point data. Callers should run it
// defensively (catch + log) so a data quirk never blocks a game operation.

import type { Wind } from '../model/GameModels.ts';
import type { GameRoundResult, WinningHandData } from '../model/GameRoundResultModels.ts';
import { ACHIEVEMENTS, type AchievementDefinition } from '../data/achievementsCatalog.ts';
import type { ComputedAchievement } from '../model/AchievementModels.ts';

const WINDS: Wind[] = ['EAST', 'SOUTH', 'WEST', 'NORTH'];

export interface AchievementGamePlayer {
    userId: number;
    points: number;
    startPlace: Wind | null;
    isSubstitutePlayer: boolean;
    chomboCount: number;
}

export interface AchievementGameRound {
    dealerNumber: number;
    result: GameRoundResult;
}

export interface AchievementGameInput {
    players: AchievementGamePlayer[];
    /** Rounds in play order. */
    rounds: AchievementGameRound[];
    /** User ids with a userRatingChange of exactly 0 in this game (the "Saki award"). */
    zeroRatingChangeUserIds: number[];
}

interface PlayerStats {
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
    best_hanchan_points: number;
    yakuman_wins: number;
    best_hand_han_points: number;
    chombo_count: number;
    worst_single_hand_loss: number;
}

function newStats(): PlayerStats {
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
        best_hanchan_points: 0,
        yakuman_wins: 0,
        best_hand_han_points: 0,
        chombo_count: 0,
        worst_single_hand_loss: 0
    };
}

function limitHandBaseValue(han: number): number {
    if (han <= 5) return 2000;
    if (han <= 7) return 3000;
    if (han <= 10) return 4000;
    return 6000;
}

function rawHandBaseValue(hand: WinningHandData, manganRoundingUp: boolean): number {
    const yakumanCount = hand.yakumanCount || 0;
    if (yakumanCount > 0) {
        return 8000 * yakumanCount;
    }

    const han = hand.han;
    if (han === undefined) {
        throw new Error('Invalid hand, han not provided');
    }
    if (han >= 5) {
        return limitHandBaseValue(han);
    }

    const fu = hand.fu;
    if (fu === undefined) {
        throw new Error('Invalid hand, fu not provided');
    }
    const result = Math.min(2000, fu * 2 ** (han + 2));
    if (manganRoundingUp && result > 1900) {
        return 2000;
    }
    return result;
}

function isYakumanHand(hand: WinningHandData): boolean {
    return (hand.yakumanCount || 0) > 0;
}

function isManganPlusExceptYakuman(hand: WinningHandData, manganRoundingUp: boolean): boolean {
    if (isYakumanHand(hand)) {
        return false;
    }
    return rawHandBaseValue(hand, manganRoundingUp) >= 2000;
}

function isHaneman(hand: WinningHandData): boolean {
    const han = hand.han || 0;
    return han >= 6 && han <= 7;
}

function isBaiman(hand: WinningHandData): boolean {
    const han = hand.han || 0;
    return han >= 8 && han <= 10;
}

function isRiichiNomi(hand: WinningHandData, winnerId: number, riichiPlayerIds: Set<number>): boolean {
    return hand.han === 1 && riichiPlayerIds.has(winnerId);
}

interface WinningHand {
    hand: WinningHandData;
    winType: 'TSUMO' | 'RON';
}

function iterWinningHands(result: GameRoundResult): WinningHand[] {
    if (result.type === 'TSUMO') {
        return [{ hand: result.winningHandData, winType: 'TSUMO' }];
    }
    if (result.type === 'RON') {
        return result.winningHandData.map((hand) => ({ hand, winType: 'RON' as const }));
    }
    return [];
}

function getRiichiPlayerIds(result: GameRoundResult): number[] {
    // CHOMBO rounds have no riichi sticks declared in the result.
    return result.type === 'CHOMBO' ? [] : result.riichiPlayerIds ?? [];
}

function getDealerUserId(seatByWind: Map<Wind, number>, dealerNumber: number): number | undefined {
    return seatByWind.get(WINDS[dealerNumber - 1]!);
}

function getDealInPlayerId(result: GameRoundResult): number {
    if (result.type !== 'RON' || result.dealInPlayerId === null || result.dealInPlayerId === undefined) {
        throw new Error('Could not determine deal-in player');
    }
    return result.dealInPlayerId;
}

function resolveWinners(stats: Map<number, PlayerStats>, definition: AchievementDefinition): ComputedAchievement {
    const metric = definition.metric;
    const values = [...stats.entries()].map(([userId, s]) => ({
        userId,
        value: (s as unknown as Record<string, number>)[metric] ?? 0
    }));

    if (values.length === 0) {
        return { metric, value: 0, winnerUserIds: [] };
    }

    if (definition.listAllQualifiers) {
        const winners = values.filter((v) => v.value > 0);
        return { metric, value: winners.length, winnerUserIds: winners.map((w) => w.userId) };
    }

    if (definition.higherIsBetter) {
        const best = Math.max(...values.map((v) => v.value));
        const winnerUserIds = best === 0 ? [] : values.filter((v) => v.value === best).map((v) => v.userId);
        return { metric, value: best, winnerUserIds };
    }

    const best = Math.min(...values.map((v) => v.value));
    return { metric, value: best, winnerUserIds: values.filter((v) => v.value === best).map((v) => v.userId) };
}

export function computeAchievements(
    games: AchievementGameInput[],
    manganRoundingUp: boolean,
    substitutePlayerPenaltyBeforeUma: number
): ComputedAchievement[] {
    const stats = new Map<number, PlayerStats>();

    const getStats = (userId: number): PlayerStats => {
        let s = stats.get(userId);
        if (s === undefined) {
            s = newStats();
            stats.set(userId, s);
        }
        return s;
    };

    for (const game of games) {
        const seatByWind = new Map<Wind, number>();
        for (const player of game.players) {
            if (player.startPlace !== null) {
                seatByWind.set(player.startPlace, player.userId);
            }
        }

        for (const player of game.players) {
            const ps = getStats(player.userId);
            ps.chombo_count += player.chomboCount || 0;
            let hanchanPoints = player.points;
            if (player.isSubstitutePlayer) {
                hanchanPoints -= substitutePlayerPenaltyBeforeUma;
            }
            ps.best_hanchan_points = Math.max(ps.best_hanchan_points, hanchanPoints);
        }

        for (const userId of game.zeroRatingChangeUserIds) {
            getStats(userId).saki_zero_after_uma_games += 1;
        }

        for (const round of game.rounds) {
            const result = round.result;
            const dealerId = getDealerUserId(seatByWind, round.dealerNumber);
            if (dealerId === undefined) {
                throw new Error('Could not determine dealer');
            }

            const riichiIds = new Set<number>(getRiichiPlayerIds(result));
            const pointChanges = new Map<number, number>(
                (result.playerPointChanges ?? []).map((pc) => [pc.playerId, pc.pointChange])
            );

            for (const playerId of riichiIds) {
                getStats(playerId).riichi_declarations += 1;
            }

            const winnerIds = new Set<number>();
            for (const { hand, winType } of iterWinningHands(result)) {
                const winnerId = hand.winnerPlayerId;
                winnerIds.add(winnerId);
                const ps = getStats(winnerId);

                if (winType === 'TSUMO') {
                    ps.tsumo_wins += 1;
                }
                if (dealerId === winnerId) {
                    ps.dealer_wins += 1;
                }
                if ((hand.han || 0) === 1) {
                    ps.one_han_wins += 1;
                }
                if (isRiichiNomi(hand, winnerId, riichiIds)) {
                    ps.riichi_nomi_wins += 1;
                }
                if (isManganPlusExceptYakuman(hand, manganRoundingUp)) {
                    ps.mangan_plus_wins_except_yakumans += 1;
                }
                if ((hand.han || 0) >= 13) {
                    ps.thirteen_plus_han_wins += 1;
                }
                if (isHaneman(hand)) {
                    ps.haneman_wins += 1;
                }
                if (isBaiman(hand)) {
                    ps.baiman_wins += 1;
                }
                if (hand.han === 2 && hand.fu === 25) {
                    ps.chiitoi_nomi_wins += 1;
                }
                if (isYakumanHand(hand)) {
                    ps.yakuman_wins += 1;
                }

                const fu = hand.fu;
                if (fu !== undefined && (hand.han || 0) < 5) {
                    ps.max_fu_hand = Math.max(ps.max_fu_hand, fu);
                }

                ps.best_hand_han_points = Math.max(ps.best_hand_han_points, hand.han || 0);
            }

            if (result.type === 'TSUMO' && result.winningHandData.winnerPlayerId === dealerId) {
                for (const [pid, change] of pointChanges) {
                    if (pid !== dealerId) {
                        if (change >= 0) {
                            throw new Error('Invalid points');
                        }
                        getStats(pid).points_fed_to_dealer += -change;
                    }
                }
            } else if (result.type === 'RON') {
                const dealInPlayerId = getDealInPlayerId(result);
                for (const { hand } of iterWinningHands(result)) {
                    if (hand.winnerPlayerId === dealerId) {
                        const change = pointChanges.get(dealerId);
                        if (change === undefined || change < 0) {
                            throw new Error('Invalid points');
                        }
                        getStats(dealInPlayerId).points_fed_to_dealer += change;
                    }
                }
            }

            if (result.type === 'TSUMO' || result.type === 'RON') {
                for (const playerId of riichiIds) {
                    if (!winnerIds.has(playerId)) {
                        getStats(playerId).lost_riichi_sticks += 1;
                    }
                }
            } else if (result.type === 'EXHAUSTIVE_DRAW' || result.type === 'ABORTIVE_DRAW') {
                for (const playerId of riichiIds) {
                    getStats(playerId).lost_riichi_sticks += 1;
                }
            }

            if (result.type === 'TSUMO' || result.type === 'RON') {
                for (const [playerId, change] of pointChanges) {
                    if (change >= 0) {
                        continue;
                    }
                    const ps = getStats(playerId);
                    const loss = -change;
                    if (result.type === 'TSUMO') {
                        ps.points_lost_on_tsumo += loss;
                    } else {
                        ps.points_lost_on_ron += loss;
                    }
                }
            }

            if (result.type === 'RON') {
                const dealInPlayerId = getDealInPlayerId(result);
                const ps = getStats(dealInPlayerId);
                for (const { hand } of iterWinningHands(result)) {
                    const change = pointChanges.get(hand.winnerPlayerId);
                    if (change === undefined || change < 0) {
                        throw new Error('Invalid points');
                    }
                    ps.worst_single_hand_loss = Math.max(ps.worst_single_hand_loss, change);
                }
            }
        }
    }

    return ACHIEVEMENTS.map((definition) => resolveWinners(stats, definition));
}
