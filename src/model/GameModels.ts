
export interface Game {
    id: number;
    eventId: number;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}

export interface GamePlayer {
    gameId: number;
    userId: number;
    name: string;
    telegramUsername: string | null;
    points: number;
    startPlace: string;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}

export interface GameWithPlayers extends Game {
    players: GamePlayer[];
}

export interface PlayerData {
    userId: number;
    points: number;
    startPlace?: string | undefined;
}

export interface GameFilters {
    dateFrom?: Date | undefined;
    dateTo?: Date | undefined;
    userId?: number | undefined;
    eventId?: number | undefined;
    sortOrder?: 'asc' | 'desc' | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
}