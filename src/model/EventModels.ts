export const UmaTieBreak = {
    WIND: 'WIND',
    DIVIDE: 'DIVIDE' 
} as const;

export type UmaTieBreak = typeof UmaTieBreak[keyof typeof UmaTieBreak];

export type TooltipBlock =
    | { type: 'paragraph'; text: string }
    | { type: 'list'; items: string[] }
    | { type: 'definitionList'; items: { term: string; description: string }[] }
    | { type: 'example'; text: string };

export interface GameRulesTooltip {
    label: string;
    content: TooltipBlock[];
}

export interface GameRulesDetailsLink {
    url: string;
    label: string;
}

export interface GameRulesSection {
    name: string;
    tooltip?: GameRulesTooltip | undefined;
    groups: GameRulesGroup[];
}

export interface GameRulesGroup {
    name: string;
    tooltip?: GameRulesTooltip | undefined;
    rules: GameRulesDetailsRule[];
}

export interface GameRulesDetailsRule {
    rule: string;
    value: string;
    tooltip?: GameRulesTooltip | undefined;
}

export interface GameRulesDetails {
    links?: GameRulesDetailsLink[] | undefined;
    sections: GameRulesSection[];
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
