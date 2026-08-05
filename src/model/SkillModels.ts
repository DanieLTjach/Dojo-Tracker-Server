export const DEFAULT_MU = 25;
export const DEFAULT_SIGMA = 25 / 3;
export const SKILL_TAU = 25 / 3 / 100;
export const SKILL_DISPLAY_BASE = 1500;
// Tuned against real club data so ranked players land in ~1700-2100.
export const SKILL_DISPLAY_SCALE = 22;
export const INACTIVITY_GRACE_DAYS = 30;
export const INACTIVITY_SIGMA_RATE = 0.0015;
export const MAX_SIGMA = DEFAULT_SIGMA;
export const DEFAULT_PROVISIONAL_GAME_THRESHOLD = 30;
/** Clubs tune the threshold in steps of 10 (10, 20, 30, ...). */
export const PROVISIONAL_GAME_THRESHOLD_STEP = 10;

export interface SkillRating {
    clubId: number;
    userId: number;
    gameSize: number;
    mu: number;
    sigma: number;
    gamesPlayed: number;
    firstRatedGameAt: Date;
    lastRatedGameAt: Date;
    modifiedAt: Date;
}

export interface SkillRatingGame {
    gameId: number;
    userId: number;
    clubId: number;
    gameSize: number;
    rank: number;
    muBefore: number;
    sigmaBefore: number;
    muAfter: number;
    sigmaAfter: number;
    playedAt: Date;
}

export interface ClubSkillConfig {
    clubId: number;
    provisionalGameThreshold: number;
    isEnabled: boolean;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}

export interface ResolvedSkillRating {
    gameSize: number;
    skill: number;
    ordinal: number;
    mu: number;
    sigma: number;
    effectiveSigma: number;
    gamesPlayed: number;
    isProvisional: boolean;
    gamesUntilRanked: number;
    provisionalGameThreshold: number;
    lastRatedGameAt: Date;
    daysSinceLastGame: number;
    place: number | null;
    isStale: boolean;
}

export interface UserClubSkillRatings {
    clubId: number;
    clubName: string;
    totalRatedGames: number;
    tracks: ResolvedSkillRating[];
}

export interface UserSkillProfileResponse {
    userId: number;
    primaryClubId: number | null;
    clubs: UserClubSkillRatings[];
}

export interface SkillLeaderboardEntry extends ResolvedSkillRating {
    userId: number;
    userName: string;
    telegramUsername: string | null;
    profileFirstName: string | null;
    profileLastName: string | null;
}

export interface SkillLeaderboardResponse {
    clubId: number;
    gameSize: number;
    provisionalGameThreshold: number;
    isStale: boolean;
    entries: SkillLeaderboardEntry[];
    provisionalEntries: SkillLeaderboardEntry[];
}

export interface SkillRecomputeResult {
    clubId: number;
    gameSize: number;
    gamesProcessed: number;
    playersAffected: number;
    durationMs: number;
}
