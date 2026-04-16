export interface ClubPollConfig {
    clubId: number;
    pollTitle: string;
    /** Days of week for event options (1=Monday, ..., 7=Sunday) */
    eventDays: number[];
    /** Day of week to send the poll (1=Monday, ..., 7=Sunday) */
    sendDay: number;
    /** Time to send in HH:MM format (Kyiv timezone) */
    sendTime: string;
    /** Additional poll options like "Результати 👀", "У цей раз я пас" */
    extraOptions: string[];
    isActive: boolean;
}
