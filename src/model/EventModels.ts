
export interface GameRules {
    id: number;
    name: string;
    numberOfPlayers: number;
    uma: number[] | number[][];
    startingPoints: number;
    startingRating: number;
}

export interface Event {
    id: number;
    name: string;
    description: string | null;
    type: string;
    gameRules: GameRules;
    dateFrom: Date | null;
    dateTo: Date | null;
    gameCount: number;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}
