
export interface GameRules {
    id: number;
    name: string;
    numberOfPlayers: number;
    uma: number[];
    startingPoints: number;
    startingRating: number;
}

export interface Event {
    id: number;
    name: string | null;
    description: string | null;
    type: string;
    gameRules: GameRules;
    dateFrom: Date | null;
    dateTo: Date | null;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}
