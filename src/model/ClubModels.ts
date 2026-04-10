import type { TelegramTopic } from "./TelegramTopic.ts";

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
    poll: TelegramTopic | null;
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