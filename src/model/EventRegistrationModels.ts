export const EventRegistrationStatus = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
} as const;

export type EventRegistrationStatus = typeof EventRegistrationStatus[keyof typeof EventRegistrationStatus];

export interface EventRegistration {
    eventId: number;
    eventName: string;
    userId: number;
    userName: string;
    firstName: string | null;
    lastName: string | null;
    hideProfile: boolean;
    isFillerPlayer: boolean;
    status: EventRegistrationStatus;
    createdAt: Date;
    modifiedAt: Date;
    modifiedBy: number;
}
