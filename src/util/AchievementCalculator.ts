// Pure port of the reference Python achievement calculator.
//
// Operates on user ids only (display names are resolved later, on read). Faithful
// to the Python: it throws on inconsistent point data. Callers should run it
// defensively (catch + log) so a data quirk never blocks a game operation.

import { type DetailedGame, Wind } from '../model/GameModels.ts';
import type { GameRoundResult, WinningHandData } from '../model/GameRoundResultModels.ts';
import { ACHIEVEMENTS, newStats, type AchievementDefinition, type PlayerStats } from '../data/achievementsCatalog.ts';
import { AchievementCriterion, type ComputedAchievement } from '../model/AchievementModels.ts';
import { calculateHandBaseValue } from './PointCalculationUtil.ts';
import type { GameRulesValues } from '../data/gameRulesCatalog.ts';
import { getSubstitutePlayerPenaltyBeforeUma } from './RulesUtils.ts';

interface WinningHand {
    hand: WinningHandData;
    winType: 'TSUMO' | 'RON';
}

export function computeAchievements(
    games: DetailedGame[],
    rules: GameRulesValues
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
        const startPlaceToPlayerId = new Map<Wind, number>();
        for (const player of game.players) {
            if (player.startPlace === null) {
                throw new Error('Each player needs to have wind specified in each game to compute achievements');
            }
            startPlaceToPlayerId.set(player.startPlace, player.userId);
        }

        for (const player of game.players) {
            const playerStats = getStats(player.userId);
            playerStats.chombo_count += player.chomboCount;
            let gamePoints = player.points;
            if (player.isSubstitutePlayer) {
                gamePoints -= getSubstitutePlayerPenaltyBeforeUma(rules);
            }
            playerStats.best_game_points = Math.max(playerStats.best_game_points, gamePoints);

            if (player.ratingChange === 0) {
                playerStats.saki_zero_after_uma_games += 1;
            }
        }

        for (const round of game.rounds) {
            const result = round.result;
            const dealerId = getDealerUserId(startPlaceToPlayerId, round.dealerNumber);

            const riichiIds = new Set<number>(getRiichiPlayerIds(result));
            const pointChanges = new Map<number, number>(
                result.playerPointChanges.map(pc => [pc.playerId, pc.pointChange])
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
                if (hand.han === 1) {
                    ps.one_han_wins += 1;
                }
                if (isRiichiNomi(hand, winnerId, riichiIds)) {
                    ps.riichi_nomi_wins += 1;
                }
                if (isManganPlusExceptYakuman(hand, rules)) {
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
                for (const hand of result.winningHandData) {
                    if (hand.winnerPlayerId === dealerId) {
                        const change = pointChanges.get(dealerId);
                        if (change === undefined || change < 0) {
                            throw new Error('Invalid points');
                        }
                        getStats(result.dealInPlayerId).points_fed_to_dealer += change;
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
                        ps.ron_deal_in_count += 1;
                    }
                }
            }

            if (result.type === 'RON') {
                const change = pointChanges.get(result.dealInPlayerId);
                if (change === undefined || change > 0) {
                    throw new Error('Invalid points');
                }
                const ps = getStats(result.dealInPlayerId);
                ps.biggest_deal_in = Math.max(ps.biggest_deal_in, -change);
            }
        }
    }

    return ACHIEVEMENTS.map(definition => resolveWinners(stats, definition));
}

function isYakumanHand(hand: WinningHandData): boolean {
    return (hand.yakumanCount || 0) > 0;
}

function isManganPlusExceptYakuman(hand: WinningHandData, rules: GameRulesValues): boolean {
    if (isYakumanHand(hand)) {
        return false;
    }
    return calculateHandBaseValue(hand, rules) >= 2000;
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

function iterWinningHands(result: GameRoundResult): WinningHand[] {
    if (result.type === 'TSUMO') {
        return [{ hand: result.winningHandData, winType: 'TSUMO' }];
    }
    if (result.type === 'RON') {
        return result.winningHandData.map(hand => ({ hand, winType: 'RON' as const }));
    }
    return [];
}

function getRiichiPlayerIds(result: GameRoundResult): number[] {
    // CHOMBO rounds have no riichi sticks declared in the result.
    return result.type === 'CHOMBO' ? [] : result.riichiPlayerIds;
}

function getDealerUserId(startPlaceToPlayerId: Map<Wind, number>, dealerNumber: number): number {
    const dealerId = startPlaceToPlayerId.get(Object.values(Wind)[dealerNumber - 1]!);
    if (dealerId === undefined) {
        throw new Error('Could not determine dealer');
    }
    return dealerId;
}

function resolveWinners(stats: Map<number, PlayerStats>, definition: AchievementDefinition): ComputedAchievement {
    const metric = definition.metric;
    const values = [...stats.entries()].map(([userId, s]) => ({
        userId,
        value: s[metric],
    }));

    if (values.length === 0) {
        return { metric, value: undefined, winnerUserIds: [] };
    }

    switch (definition.criterion) {
        case AchievementCriterion.AllQualifiers: {
            const winners = values.filter(v => v.value > 0);
            return { metric, value: undefined, winnerUserIds: winners.map(w => w.userId) };
        }
        case AchievementCriterion.Highest: {
            const best = Math.max(...values.map(v => v.value));
            if (best === 0) {
                return { metric, value: undefined, winnerUserIds: [] };
            }
            return { metric, value: best, winnerUserIds: values.filter(v => v.value === best).map(v => v.userId) };
        }
        case AchievementCriterion.Lowest: {
            const applicabilityMetric = definition.applicabilityMetric;
            const candidates = applicabilityMetric === undefined
                ? values
                : [...stats.entries()]
                    .filter(([, s]) => s[applicabilityMetric] > 0)
                    .map(([userId, s]) => ({ userId, value: s[metric] }));
            if (candidates.length === 0) {
                return { metric, value: undefined, winnerUserIds: [] };
            }
            const best = Math.min(...candidates.map(v => v.value));
            return { metric, value: best, winnerUserIds: candidates.filter(v => v.value === best).map(v => v.userId) };
        }
    }
}
