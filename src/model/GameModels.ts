import type { GameRoundResult } from "./GameRoundResultModels.ts";

export const Wind = {
    EAST: 'EAST',
    SOUTH: 'SOUTH',
    WEST: 'WEST',
    NORTH: 'NORTH'
} as const;

export type Wind = typeof Wind[keyof typeof Wind];

export function nextWind(wind: Wind): Wind {
    return Object.values(Wind)[(Object.values(Wind).indexOf(wind) + 1) % 4]!;
}

export const WIND_ORDER: Record<Wind, number> = Object.fromEntries(
    Object.values(Wind).map((wind, index) => [wind, index])
) as Record<Wind, number>;

export const GameStatus = {
    CREATED: 'CREATED',
    IN_PROGRESS: 'IN_PROGRESS',
    FINISHED: 'FINISHED'
} as const;

export type GameStatus = typeof GameStatus[keyof typeof GameStatus];

export interface GameState {
    wind: Wind;
    dealerNumber: number;
    counters: number;
    riichiSticks: number;
}

export interface GameRound extends GameState {
    gameId: number;
    roundNumber: number;
    result: GameRoundResult;
}

export interface Game {
    id: number;
    eventId: number;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
    tournamentRound: number | null;
    tournamentTable: string | null;
    status: GameStatus;
    startedAt: Date | null;
    endedAt: Date | null;
    lastRoundWasDeleted: boolean;
}

export interface GamePlayer {
    gameId: number;
    userId: number;
    name: string;
    telegramUsername: string | null;
    points: number;
    ratingChange: number;
    startPlace: Wind | null;
    chomboCount: number;
}

export interface GameWithPlayers extends Game {
    players: GamePlayer[];
}

export interface DetailedGame extends GameWithPlayers {
    rounds: GameRound[];
    currentState: GameState | null;
}

export interface PlayerData {
    userId: number;
    points: number;
    startPlace?: Wind | undefined | null;
    chomboCount?: number | undefined | null;
}

export interface TrackedGamePlayerData {
    userId: number;
    startPlace: Wind;
}

export interface GameFilters {
    dateFrom?: Date | undefined;
    dateTo?: Date | undefined;
    userId?: number | undefined;
    eventId?: number | undefined;
    clubId?: number | undefined;
    sortOrder?: 'asc' | 'desc' | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
}
