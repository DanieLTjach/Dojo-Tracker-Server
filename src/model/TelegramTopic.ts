import config from "../../config/config.ts";

export const ClubTelegramTopicType = {
    RATING: 'RATING',
    USER_LOGS: 'USER_LOGS',
    GAME_LOGS: 'GAME_LOGS'
} as const;

export type ClubTelegramTopicType = typeof ClubTelegramTopicType[keyof typeof ClubTelegramTopicType];

export const TelegramTopicType = {
    ...ClubTelegramTopicType,
    ERROR_LOGS: 'ERROR_LOGS'
} as const;

export type TelegramTopicType = typeof TelegramTopicType[keyof typeof TelegramTopicType];

export interface TelegramTopic {
    type: TelegramTopicType;
    chatId: number;
    topicId: number | undefined;
}

export const globalUserLogsTopic: TelegramTopic | null =
    config.globalLogsChatId !== undefined ? {
        type: TelegramTopicType.USER_LOGS,
        chatId: config.globalLogsChatId,
        topicId: config.globalUserLogsTopicId
    } : null;

export const globalGameLogsTopic: TelegramTopic | null =
    config.globalLogsChatId !== undefined ? {
        type: TelegramTopicType.GAME_LOGS,
        chatId: config.globalLogsChatId,
        topicId: config.globalGameLogsTopicId
    } : null;

export const globalErrorLogsTopic: TelegramTopic | null =
    config.globalLogsChatId !== undefined ? {
        type: TelegramTopicType.ERROR_LOGS,
        chatId: config.globalLogsChatId,
        topicId: config.globalErrorLogsTopicId
    } : null;