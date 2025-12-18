import type { UnresolvedUserInfo, ResolvedUserInfo } from './UserModels.ts';

export interface Game {
    id: number;
    eventId: number;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
}

export interface GamePlayer {
    gameId: number;
    userId: number;
    name: string;
    telegramUsername: string | null;
    points: number;
    startPlace: string;
}

export interface GameWithPlayers extends Game {
    players: GamePlayer[];
}

export interface PlayerData {
    user: UnresolvedUserInfo;
    points: number;
    startPlace?: string | undefined;
}

export interface ResolvedPlayerData {
    user: ResolvedUserInfo;
    points: number;
    startPlace?: string | undefined;
}

export interface GameFilters {
    dateFrom?: Date | undefined;
    dateTo?: Date | undefined;
    userId?: number | undefined;
    eventId?: number | undefined;
}