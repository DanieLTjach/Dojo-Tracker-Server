export const UmaTieBreak = {
    WIND: 'WIND',
    DIVIDE: 'DIVIDE' 
} as const;

export type UmaTieBreak = typeof UmaTieBreak[keyof typeof UmaTieBreak];

export interface GameRulesTooltip {
    label: string;
    content: string;
}

export interface GameRulesDetailsLink {
    url: string;
    label: string;
}

export interface GameRulesDetailsRule {
    rule: string;
    value: string;
    tooltip?: GameRulesTooltip | undefined;
}

export interface GameRulesDetails {
    links?: GameRulesDetailsLink[] | undefined;
    rules: GameRulesDetailsRule[];
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
