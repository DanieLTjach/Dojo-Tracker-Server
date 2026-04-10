export const UmaTieBreak = {
    WIND: 'WIND',
    DIVIDE: 'DIVIDE' 
} as const;

export type UmaTieBreak = typeof UmaTieBreak[keyof typeof UmaTieBreak];

export interface GameRulesTooltip {
    label: string;
    content: string;
}

export interface GameRulesDetails {
    type: 'table' | 'text';
    link?: {
        url: string;
        label: string;
    } | undefined;
    table?: {
        headers: string[];
        rows: string[][];
        rowTooltips?: (GameRulesTooltip | null)[] | undefined;
    } | undefined;
    text?: string | undefined;
    tooltips?: GameRulesTooltip[] | undefined;
}

export interface GameRules {
    id: number;
    name: string;
    clubId: number | null;
    numberOfPlayers: number;
    uma: number[] | number[][];
    startingPoints: number;
    chomboPointsAfterUma: number | null;
    umaTieBreak: UmaTieBreak;
    details: GameRulesDetails | null;
}

export interface Event {
    id: number;
    name: string;
    description: string | null;
    type: string;
    clubId: number | null;
    isCurrentRating: boolean;
    gameRules: GameRules;
    startingRating: number;
    minimumGamesForRating: number;
    dateFrom: Date | null;
    dateTo: Date | null;
    gameCount: number;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}
