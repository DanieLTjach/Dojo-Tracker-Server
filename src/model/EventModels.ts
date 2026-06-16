import type { GameRulesValues } from '../data/gameRulesCatalog.ts';

export const UmaTieBreak = {
    WIND: 'WIND',
    DIVIDE: 'DIVIDE',
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
    umaTieBreak: UmaTieBreak;
    details: GameRulesDetails | null;
}

export interface EventInfoScheduleItem {
    time: string;
    title: string;
    kind?: 'default' | 'muted' | 'milestone' | undefined;
}

export interface EventInfoScheduleDay {
    date: string | null;
    title?: string | undefined;
    items: EventInfoScheduleItem[];
}

export interface EventInfoVenue {
    name?: string | undefined;
    address?: string | undefined;
    city?: string | undefined;
    latitude?: number | undefined;
    longitude?: number | undefined;
    mapUrl?: string | undefined;
    contactName?: string | undefined;
    contactTelegram?: string | undefined;
}

export interface EventInfoContacts {
    phone?: string | undefined;
    email?: string | undefined;
    telegram?: string | undefined;
}

export interface EventInfoLinks {
    site?: string | undefined;
    registrationForm?: string | undefined;
    googleMaps?: string | undefined;
}

export interface EventInfo {
    schedule?: EventInfoScheduleDay[] | undefined;
    venue?: EventInfoVenue | undefined;
    contacts?: EventInfoContacts | undefined;
    links?: EventInfoLinks | undefined;
    pairings?: number[][][] | undefined;
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
    maxParticipants: number | null;
    registrationDeadline: Date | null;
    info: EventInfo | null;
    blockGameCreation: boolean;
    gameCount: number;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}
