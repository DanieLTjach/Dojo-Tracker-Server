export const TeamRole = {
    CAPTAIN: 'CAPTAIN',
    MEMBER: 'MEMBER',
} as const;

export type TeamRole = typeof TeamRole[keyof typeof TeamRole];

export interface TeamMember {
    userId: number;
    name: string;
    profileFirstName: string | null;
    profileLastName: string | null;
    profileHidden: boolean;
    role: TeamRole;
}

export interface Team {
    id: number;
    eventId: number;
    name: string;
    members: TeamMember[];
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}

/** userId -> teamId for a single event. Built once and reused by seating and rating. */
export type PlayerTeamMap = Map<number, number>;

export interface TeamStanding {
    team: { id: number, name: string };
    /** Latest team rating for the event, normalized to rating units. */
    totalTeamRating: number;
    /** Number of scored games that counted toward this team. */
    gamesCounted: number;
    /** 1-based place; tied totals share the same place. */
    place: number;
}

export interface TeamAvailablePlayerDTO {
    userId: number;
    name: string;
    profileFirstName: string | null;
    profileLastName: string | null;
    profileHidden: boolean;
}

export interface TeamMemberCountDTO {
    teamId: number;
    memberCount: number;
}

export interface TeamStandingRowDTO {
    teamId: number;
    teamName: string;
    totalTeamRating: number;
    gamesCounted: number;
}
