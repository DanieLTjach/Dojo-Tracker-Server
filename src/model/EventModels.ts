export const UmaTieBreak = {
    WIND: 'WIND',
    DIVIDE: 'DIVIDE' 
} as const;

export type UmaTieBreak = typeof UmaTieBreak[keyof typeof UmaTieBreak];

export interface GameRules {
    id: number;
    name: string;
    clubId: number | null;
    numberOfPlayers: number;
    uma: number[] | number[][];
    startingPoints: number;
    startingRating: number;
    minimumGamesForRating: number;
    chomboPointsAfterUma: number | null;
    umaTieBreak: UmaTieBreak;
}

export interface Event {
    id: number;
    name: string;
    description: string | null;
    type: string;
    clubId: number | null;
    gameRules: GameRules;
    dateFrom: Date | null;
    dateTo: Date | null;
    gameCount: number;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}
