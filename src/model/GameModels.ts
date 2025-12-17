import type { UnresolvedUserInfo, ResolvedUserInfo } from './UserModels.ts';

export interface Game {
    id: number;
    event_id: number;
    created_at: string;
    modified_at: string;
    modified_by: number;
}

export interface GamePlayer {
    game_id: number;
    user_id: number;
    name: string;
    telegram_username: string | null;
    points: number;
    start_place: string;
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