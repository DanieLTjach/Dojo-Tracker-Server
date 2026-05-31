import type { TelegramTopic } from "./TelegramTopic.ts";
import type { User } from "./UserModels.ts";

export const ClubRole = {
    OWNER: 'OWNER',
    MODERATOR: 'MODERATOR',
    MEMBER: 'MEMBER'
} as const;

export type ClubRole = typeof ClubRole[keyof typeof ClubRole];

export const ClubMembershipStatus = {
    PENDING: 'PENDING',
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE'
} as const;

export type ClubMembershipStatus = typeof ClubMembershipStatus[keyof typeof ClubMembershipStatus];

export interface Club {
    id: number;
    name: string;
    address: string | null;
    city: string | null;
    description: string | null;
    contactInfo: string | null;
    isActive: boolean;
    currentRatingEventId: number | null;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}

export interface ClubTelegramTopics {
    rating: TelegramTopic | null;
    userLogs: TelegramTopic | null;
    gameLogs: TelegramTopic | null;
    clubLogs: TelegramTopic | null;
    main: TelegramTopic | null;
}

export interface ClubMembership {
    clubId: number;
    clubName: string;
    userId: number;
    userName: string;
    role: ClubRole;
    status: ClubMembershipStatus;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}

export interface ClubPermissions {
    canEditClub: boolean;
    canManageMembers: boolean;
}

export interface UserClubMembership {
    clubId: number;
    clubName: string;
    role: ClubRole;
    status: ClubMembershipStatus;
    permissions: ClubPermissions;
}

export const ClubInviteType = {
    AUTO_APPROVE: 'AUTO_APPROVE',
    SYSTEM_ONLY: 'SYSTEM_ONLY'
} as const;

export type ClubInviteType = typeof ClubInviteType[keyof typeof ClubInviteType];

export const ClubInviteSource = {
    PERSON: 'PERSON',
    TUTORIAL: 'TUTORIAL',
    FESTIVAL: 'FESTIVAL',
    SOCIAL_NETWORK: 'SOCIAL_NETWORK',
    OTHER: 'OTHER'
} as const;

export type ClubInviteSource = typeof ClubInviteSource[keyof typeof ClubInviteSource];

export interface ClubInvite {
    id: number;
    clubId: number;
    clubName: string;
    code: string;
    type: ClubInviteType;
    source: ClubInviteSource;
    label: string | null;
    maxUses: number | null;
    usesCount: number;
    expiresAt: Date | null;
    isActive: boolean;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}

export interface ClubInviteRedemption {
    inviteId: number;
    userId: number;
    redeemedAt: Date;
}

export type InviteNextAction = 'TUTORIAL' | 'CLUB_HOME';

export interface InviteRedemptionResult {
    type: ClubInviteType;
    clubId: number;
    clubName: string;
    user: User;
    nextAction: InviteNextAction;
}