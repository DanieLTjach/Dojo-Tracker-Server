export const StartPlace = {
    EAST: 'EAST',
    SOUTH: 'SOUTH',
    WEST: 'WEST',
    NORTH: 'NORTH'
} as const;

export type StartPlace = typeof StartPlace[keyof typeof StartPlace];

export interface Game {
    id: number;
    eventId: number;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
    tournamentHanchanNumber: number | null;
    tournamentTableNumber: number | null;
}

export interface GamePlayer {
    gameId: number;
    userId: number;
    name: string;
    telegramUsername: string | null;
    points: number;
    ratingChange: number;
    startPlace: StartPlace | null;
    chomboCount: number;
}

export interface GameWithPlayers extends Game {
    players: GamePlayer[];
}

export interface PlayerData {
    userId: number;
    points: number;
    startPlace?: StartPlace | undefined | null;
    chomboCount?: number | undefined | null;
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
