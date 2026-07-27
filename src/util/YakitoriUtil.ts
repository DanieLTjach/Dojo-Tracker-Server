import type { GamePlayer, GameRound } from '../model/GameModels.ts';
import type { GameRulesValues } from '../data/gameRulesCatalog.ts';
import type { PlayerPointChange } from '../model/GameRoundResultModels.ts';
import { getYakitoriPaymentStep } from './RulesUtils.ts';

export function findPlayersWhoWonAHand(rounds: GameRound[]): Set<number> {
    const winners = new Set<number>();
    for (const round of rounds) {
        const result = round.result;
        if (result.type === 'TSUMO') {
            winners.add(result.winningHandData.winnerPlayerId);
        } else if (result.type === 'RON') {
            for (const hand of result.winningHandData) {
                winners.add(hand.winnerPlayerId);
            }
        }
    }
    return winners;
}

export function calculateYakitoriPointChanges(
    players: GamePlayer[],
    rules: GameRulesValues,
    yakitoriPlayerIds: ReadonlySet<number>
): PlayerPointChange[] {
    const step = getYakitoriPaymentStep(rules);
    if (step === 0) return [];
    const yakitori = players.filter(p => yakitoriPlayerIds.has(p.userId));
    const winners = players.filter(p => !yakitoriPlayerIds.has(p.userId));
    // Nobody won a hand all game, or everybody did: no transfer either way.
    if (yakitori.length === 0 || winners.length === 0) return [];

    // Every yakitori pays every non-yakitori one step. Pure multiplication, so the
    // table stays exactly zero-sum for any step and player count -- deliberately
    // unlike splitRemainingRiichiSticksAmongWinners, which floors away a remainder.
    return [
        ...yakitori.map(p => ({ playerId: p.userId, pointChange: -step * winners.length })),
        ...winners.map(p => ({ playerId: p.userId, pointChange: step * yakitori.length })),
    ];
}
