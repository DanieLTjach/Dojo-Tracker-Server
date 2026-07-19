import type { AchievementValueUnit } from '../data/achievementsCatalog.ts';

export const AchievementCriterion = {
    Highest: 'highest',
    Lowest: 'lowest',
    AllQualifiers: 'all-qualifiers',
} as const;

export type AchievementCriterion = typeof AchievementCriterion[keyof typeof AchievementCriterion];

/**
 * Output of the pure calculator: winners (by user id) and the headline value for
 * a metric. `value` is undefined for "all-qualifiers" achievements (and when no
 * player qualified), where a single headline value makes no sense.
 */
export interface ComputedAchievement {
    metric: string;
    value: number | undefined;
    winnerUserIds: number[];
}

/** A single persisted eventAchievement row. `value` is null for "all-qualifiers" achievements. */
export interface EventAchievementRow {
    eventId: number;
    metric: string;
    userId: number;
    value: number | null;
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
    criterion: AchievementCriterion;
    valueUnit: AchievementValueUnit;
    value: number | undefined;
    valueFormatted: string | undefined;
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
    value: number | undefined;
    valueFormatted: string | undefined;
}

/** A club-scoped, reusable custom achievement a club owner/moderator can assign. */
export interface ClubAchievementDefinition {
    id: number;
    clubId: number;
    name: string;
    description: string;
    icon: string | null;
    archivedAt: Date | null;
    archivedBy: number | null;
    createdAt: Date;
    createdBy: number;
    modifiedAt: Date;
    modifiedBy: number;
}

/** One instance of a club awarding an achievement (built-in or custom) to a member. */
export interface ClubUserAchievement {
    id: number;
    clubId: number;
    userId: number;
    builtInCode: string | null;
    definitionId: number | null;
    note: string | null;
    awardedAt: Date;
    awardedBy: number;
    revokedAt: Date | null;
    revokedBy: number | null;
}
