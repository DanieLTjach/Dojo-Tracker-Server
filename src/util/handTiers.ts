import type { GameRoundResult, WinningHandData } from '../model/GameRoundResultModels.ts';

// Winning-hand extraction and scoring-tier predicates shared by the two
// achievement engines (the automatic evaluator and the tournament-award
// calculator), so both count a hand the same way.

export interface WinningHandExtraction {
    hand: WinningHandData;
    winType: 'TSUMO' | 'RON';
}

export function iterWinningHands(result: GameRoundResult): WinningHandExtraction[] {
    if (result.type === 'TSUMO') {
        return [{ hand: result.winningHandData, winType: 'TSUMO' }];
    }
    if (result.type === 'RON') {
        return result.winningHandData.map(hand => ({ hand, winType: 'RON' as const }));
    }
    return [];
}

// Upper tiers are pure han ranges: a 10-han hand is a baiman, not a haneman.
// Mangan keeps the fu-based equivalents (4 han 40+ fu, 3 han 70+ fu) because
// those hands score as mangan whatever their han count.
export function isMangan(hand: WinningHandData): boolean {
    const han = hand.han || 0;
    return han === 5 || (han === 4 && (hand.fu || 0) >= 40) || (han === 3 && (hand.fu || 0) >= 70);
}

export function isHaneman(hand: WinningHandData): boolean {
    const han = hand.han || 0;
    return han >= 6 && han <= 7;
}

export function isBaiman(hand: WinningHandData): boolean {
    const han = hand.han || 0;
    return han >= 8 && han <= 10;
}

export function isSanbaiman(hand: WinningHandData): boolean {
    const han = hand.han || 0;
    return han >= 11 && han <= 12;
}
