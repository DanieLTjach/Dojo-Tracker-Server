import type { AchievementValueUnit } from '../data/achievementsCatalog.ts';

/** Output of the pure calculator: winners (by user id) and the headline value for a metric. */
export interface ComputedAchievement {
    metric: string;
    value: number;
    winnerUserIds: number[];
}

/** A single persisted eventAchievement row. */
export interface EventAchievementRow {
    eventId: number;
    metric: string;
    userId: number;
    value: number;
}

export interface AchievementWinner {
    userId: number;
    name: string;
    profileFirstName: string | null;
    profileLastName: string | null;
}

/**
 * One achievement as shown on the tournament page: catalog metadata joined with
 * the computed winners. `winners` is empty when no player qualified.
 */
export interface EventAchievementResult {
    metric: string;
    name: string;
    description: string;
    criterion: 'highest' | 'lowest' | 'all-qualifiers';
    valueUnit: AchievementValueUnit;
    value: number;
    valueFormatted: string;
    tied: boolean;
    winners: AchievementWinner[];
}

/**
 * One achievement a user has won, as shown on their profile page. Includes the
 * owning tournament so the frontend can group/link by event.
 */
export interface UserAchievement {
    eventId: number;
    eventName: string;
    metric: string;
    name: string;
    description: string;
    valueUnit: AchievementValueUnit;
    value: number;
    valueFormatted: string;
}
