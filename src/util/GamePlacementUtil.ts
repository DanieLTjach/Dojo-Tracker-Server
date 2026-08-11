import type { UmaTieBreak } from '../model/EventModels.ts';
import type { Wind } from '../model/GameModels.ts';
import { WIND_ORDER } from '../model/GameModels.ts';
import LogService from '../service/LogService.ts';

export interface PlacementInput {
    userId: number;
    points: number;
    startPlace?: Wind | null | undefined;
}

/**
 * Calculates 1-indexed placements for players in a game.
 * The returned ranks are aligned with the input `players` array order.
 * Equal ranks (e.g. [1, 2, 2, 4]) represent genuine ties under competition ranking.
 */
export function calculatePlacements(
    players: readonly PlacementInput[],
    umaTieBreak: UmaTieBreak
): number[] {
    if (players.length === 0) {
        return [];
    }

    const indexed = players.map((p, index) => ({ ...p, originalIndex: index }));

    if (umaTieBreak === 'WIND') {
        const hasTie = new Set(players.map(p => p.points)).size < players.length;
        if (hasTie) {
            const hasMissingStartPlace = players.some(
                p => p.startPlace === undefined || p.startPlace === null || !(p.startPlace in WIND_ORDER)
            );
            if (hasMissingStartPlace) {
                LogService.logError(
                    'Missing startPlace for player with tied score under WIND tiebreak, falling back to DIVIDE placement'
                );
                return calculateCompetitionRanking(indexed);
            }
        }

        const sorted = [...indexed].sort((a, b) =>
            b.points - a.points || WIND_ORDER[a.startPlace!] - WIND_ORDER[b.startPlace!]
        );

        const ranks = new Array<number>(players.length);
        for (let i = 0; i < sorted.length; i++) {
            ranks[sorted[i]!.originalIndex] = i + 1;
        }
        return ranks;
    }

    return calculateCompetitionRanking(indexed);
}

function calculateCompetitionRanking(
    indexedPlayers: Array<PlacementInput & { originalIndex: number }>
): number[] {
    const sorted = [...indexedPlayers].sort((a, b) => b.points - a.points);
    const ranks = new Array<number>(indexedPlayers.length);

    let currentRank = 1;
    for (let i = 0; i < sorted.length; i++) {
        if (i > 0 && sorted[i]!.points < sorted[i - 1]!.points) {
            currentRank = i + 1;
        }
        ranks[sorted[i]!.originalIndex] = currentRank;
    }

    return ranks;
}
