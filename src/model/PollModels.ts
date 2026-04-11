export interface ClubPollConfig {
    clubId: number;
    pollTitle: string;
    /** Days of week for event options (0=Sunday, 1=Monday, ..., 6=Saturday) */
    eventDays: number[];
    /** Day of week to send the poll (0=Sunday, ..., 6=Saturday) */
    sendDay: number;
    /** Time to send in HH:MM format (Kyiv timezone) */
    sendTime: string;
    /** Additional poll options like "Результати 👀", "У цей раз я пас" */
    extraOptions: string[];
    isActive: boolean;
}
