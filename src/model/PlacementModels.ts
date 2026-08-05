import type { EventType } from './EventModels.ts';

export interface UserPlacementEntry {
    eventId: number;
    eventName: string;
    eventType: EventType;
    clubId: number;
    clubName: string;
    dateFrom: Date;
    dateTo: Date;
    place: number | null;
    totalRankedPlayers: number;
    gamesPlayed: number;
    rating: number;
    minimumGamesPlayed: boolean;
}

export interface UserPlacementHistoryResponse {
    userId: number;
    tournaments: UserPlacementEntry[];
    seasons: UserPlacementEntry[];
}
