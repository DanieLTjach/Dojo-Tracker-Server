export const UsageAction = {
    SAVED_GAME_CREATED: 'SAVED_GAME_CREATED',
    TRACKED_GAME_CREATED: 'TRACKED_GAME_CREATED',
    TRACKED_ROUND_RESULT_CREATED: 'TRACKED_ROUND_RESULT_CREATED',
    TOURNAMENT_SEATING_APPLIED: 'TOURNAMENT_SEATING_APPLIED',
    TOURNAMENT_ROUND_IMPORTED: 'TOURNAMENT_ROUND_IMPORTED',
    CSV_GAMES_IMPORTED: 'CSV_GAMES_IMPORTED',
} as const;

export type UsageAction = typeof UsageAction[keyof typeof UsageAction];

export const UsageAdjustmentType = {
    CREDIT_ADJUSTMENT: 'CREDIT_ADJUSTMENT',
    OVERDRAFT_CUTOFF_UPDATE: 'OVERDRAFT_CUTOFF_UPDATE',
} as const;

export type UsageAdjustmentType = typeof UsageAdjustmentType[keyof typeof UsageAdjustmentType];

export interface ClubUsageAccount {
    clubId: number;
    creditsBalance: number;
    overdraftCutoff: number;
    overdraftMultiplier: number;
    isEnforced: boolean;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}

export interface ClubUsageDaily {
    clubId: number;
    usageDate: string;
    action: UsageAction;
    actionCount: number;
    baseCredits: number;
    chargedCredits: number;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}

export interface ClubUsageAdjustment {
    id: number;
    clubId: number;
    type: UsageAdjustmentType;
    creditsDelta: number | null;
    previousCreditsBalance: number;
    newCreditsBalance: number;
    previousOverdraftCutoff: number;
    newOverdraftCutoff: number;
    reason: string;
    externalReference: string | null;
    createdAt: Date;
    createdBy: number;
}

export interface UsageChargeResult {
    clubId: number;
    action: UsageAction;
    count: number;
    baseCredits: number;
    chargedCredits: number;
    creditsBalance: number;
    overdraftCutoff: number;
    warning: boolean;
}
