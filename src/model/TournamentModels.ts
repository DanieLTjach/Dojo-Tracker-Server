export const TournamentStatus = {
    CREATED: 'CREATED',
    DRAFT: 'DRAFT',
    IN_PROGRESS: 'IN_PROGRESS',
    LAST_ROUND: 'LAST_ROUND',
    FINISHED: 'FINISHED',
} as const;

export type TournamentStatus = typeof TournamentStatus[keyof typeof TournamentStatus];

export interface Tournament {
    eventId: number;
    status: TournamentStatus;
    currentRound: number | null;
    totalRounds: number;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}
