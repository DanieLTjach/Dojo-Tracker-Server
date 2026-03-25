export const clubRoles = ['OWNER', 'MODERATOR', 'MEMBER'] as const;
export type ClubRole = typeof clubRoles[number];

export const clubMembershipStatuses = ['PENDING', 'ACTIVE', 'INACTIVE'] as const;
export type ClubMembershipStatus = typeof clubMembershipStatuses[number];
export interface Club {
    id: number;
    name: string;
    address: string | null;
    city: string | null;
    description: string | null;
    contactInfo: string | null;
    isActive: boolean;
    ratingChatId: string | null;
    ratingTopicId: string | null;
    currentRatingEventId: number | null;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}

export interface ClubMembership {
    clubId: number;
    userId: number;
    userName: string;
    role: ClubRole;
    status: ClubMembershipStatus;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}

export interface ClubMembershipStatusPermissions {
    canEditClub: boolean;
    canManageMembers: boolean;
}

export interface UserClubMembership {
    clubId: number;
    role: ClubRole;
    status: ClubMembershipStatus;
    permissions: ClubMembershipStatusPermissions;
}
