import type { GameRulesValues } from '../data/gameRulesCatalog.ts';
import type { Tournament } from './TournamentModels.ts';

export const UmaTieBreak = {
    WIND: 'WIND',
    DIVIDE: 'DIVIDE',
} as const;

export type UmaTieBreak = typeof UmaTieBreak[keyof typeof UmaTieBreak];

export const EventType = {
    SEASON: 'SEASON',
    TOURNAMENT: 'TOURNAMENT',
} as const;

export type EventType = typeof EventType[keyof typeof EventType];

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
    paymentInfo?: string | undefined;
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

export const PlayerNameDisplay = {
    DEFAULT: 'DEFAULT',
    NICKNAME: 'NICKNAME',
    REAL_NAME: 'REAL_NAME',
} as const;

export type PlayerNameDisplay = typeof PlayerNameDisplay[keyof typeof PlayerNameDisplay];

export interface EventConfig {
    playerNameDisplay?: PlayerNameDisplay | undefined;
    minParticipants?: number | undefined;
    maxParticipants?: number | undefined;
    registrationDeadline?: Date | undefined;
    resultsHidden?: boolean | undefined;
}

/**
 * Resolves the effective player name display mode for an event. When the config is
 * unset or DEFAULT, falls back to the type-based default: tournaments show real names,
 * seasons show nicknames. Always returns NICKNAME or REAL_NAME (never DEFAULT).
 */
export function resolvePlayerNameDisplay(config: EventConfig | null, eventType: EventType): PlayerNameDisplay {
    const mode = config?.playerNameDisplay;
    if (mode === PlayerNameDisplay.NICKNAME || mode === PlayerNameDisplay.REAL_NAME) {
        return mode;
    }
    return eventType === EventType.TOURNAMENT ? PlayerNameDisplay.REAL_NAME : PlayerNameDisplay.NICKNAME;
}

/**
 * Whether results (ratings / standings / per-player deltas) are currently hidden
 * from non-managers. Driven solely by the organizer-controlled config flag.
 */
export function resolveResultsHidden(config: EventConfig | null): boolean {
    return config?.resultsHidden === true;
}

export interface Event {
    id: number;
    name: string;
    description: string | null;
    type: EventType;
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
    config: EventConfig | null;
    resolvedPlayerNameDisplay: PlayerNameDisplay;
    resolvedResultsHidden: boolean;
    blockGameCreation: boolean;
    tournament: Tournament | null;
    gameCount: number;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}
