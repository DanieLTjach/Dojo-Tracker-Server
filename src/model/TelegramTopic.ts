import type { ApiMethods } from "telegraf/types";
import config from "../../config/config.ts";

type SendMessageOptions = Omit<
    Parameters<ApiMethods<any>['sendMessage']>[0],
    'chat_id' | 'text'>;

export interface TelegramTopic {
    getChatId(): number | undefined;
    getTopicId(): number | undefined;
    getSendingOptions(): SendMessageOptions;
}

class RatingTopicClass implements TelegramTopic {

    getChatId(): number | undefined {
        return config.ratingChatId;
    }

    getTopicId(): number | undefined {
        return config.ratingTopicId;
    }

    getSendingOptions(): SendMessageOptions {
        return {
            parse_mode: 'HTML',
            link_preview_options: {
                is_disabled: true
            }
        };
    }
}

export const RatingTopic = new RatingTopicClass();

abstract class AdminLogsTopic implements TelegramTopic {

    getChatId(): number | undefined {
        return config.adminChatId;
    }

    abstract getTopicId(): number | undefined;

    getSendingOptions(): SendMessageOptions {
        return { parse_mode: 'HTML' };
    }
}

class ErrorLogsTopicClass extends AdminLogsTopic {
    getTopicId(): number | undefined {
        return config.errorLogsTopicId;
    }
}

export const ErrorLogsTopic = new ErrorLogsTopicClass();

class UserLogsTopicClass extends AdminLogsTopic {
    getTopicId(): number | undefined {
        return config.userLogsTopicId;
    }
}

export const UserLogsTopic = new UserLogsTopicClass();

class GameLogsTopicClass extends AdminLogsTopic {
    getTopicId(): number | undefined {
        return config.gameLogsTopicId;
    }
}

export const GameLogsTopic = new GameLogsTopicClass();