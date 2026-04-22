import type { GameRulesValues } from '../data/gameRulesCatalog.ts';

export const UmaTieBreak = {
    WIND: 'WIND',
    DIVIDE: 'DIVIDE'
} as const;

export type UmaTieBreak = typeof UmaTieBreak[keyof typeof UmaTieBreak];

export type RuleValue = boolean | number | string;

export interface LinkEntry {
    url: string;
    label: string;
}

export interface CustomRuleEntry {
    category: 'yaku' | 'fu' | 'rule';
    value: boolean | number | string;
    name: string;
    tooltip?: string | undefined;
}

export interface GameRulesDetails {
    preset?: string | undefined;
    rules: GameRulesValues;
    links?: LinkEntry[] | undefined;
    customRules?: CustomRuleEntry[] | undefined;
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
