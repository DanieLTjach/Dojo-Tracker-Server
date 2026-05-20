import type { GameFinishReason, GameState } from "./GameModels.ts";

export type GameRoundResult = GameRoundResultInputDTO & {
    playerPointChanges: PlayerPointChange[];
    nextState: GameState | undefined;
    gameFinishReason: GameFinishReason | undefined;
}

export type GameRoundResultInputDTO = Tsumo | Ron | ExhaustiveDraw | AbortiveDraw | Chombo;

export interface PlayerPointChange {
    playerId: number;
    pointChange: number;
}

export interface Tsumo {
    type: 'TSUMO';
    winningHandData: WinningHandData;
    riichiPlayerIds: number[];
}

export interface Ron {
    type: 'RON';
    dealInPlayerId: number;
    winningHandData: WinningHandData[];
    riichiPlayerIds: number[];
}

export interface WinningHandData {
    winnerPlayerId: number;
    yakumanCount: number; // 0 if no yakuman
    yakumanLiabilityPlayerId?: number | undefined;
    han?: number | undefined; // han are undefined for yakumans (except kazoe yakuman)
    fu?: number | undefined; // fu are undefined for hands with at least 5 hans
}

export interface ExhaustiveDraw {
    type: 'EXHAUSTIVE_DRAW';
    riichiPlayerIds: number[];
    tenpaiPlayerIds: number[];
    nagashiManganPlayerIds: number[];
}

export interface AbortiveDraw {
    type: 'ABORTIVE_DRAW';
    drawType: AbortiveDrawType;
    riichiPlayerIds: number[];
}

export const AbortiveDrawType = {
    NINE_TERMINALS: 'NINE_TERMINALS',
    FOUR_WINDS: 'FOUR_WINDS',
    FOUR_KANS: 'FOUR_KANS',
    FOUR_RIICHI: 'FOUR_RIICHI',
    TRIPLE_RON: 'TRIPLE_RON'
} as const;

export type AbortiveDrawType = typeof AbortiveDrawType[keyof typeof AbortiveDrawType];

export interface Chombo {
    type: 'CHOMBO';
    offenderPlayerId: number;
}