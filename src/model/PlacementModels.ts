export interface UserPlacementEntry {
    eventId: number;
    eventName: string;
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
