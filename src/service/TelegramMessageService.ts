import type { ApiMethods } from 'telegraf/types';
import { TelegramTopicType } from '../model/TelegramTopic.ts';
import type { TelegramTopic } from '../model/TelegramTopic.ts';
import { telegramBot } from './TelegramBot.ts';

class TelegramMessageService {

    async sendMessage(message: string, topic: TelegramTopic) {
        let sendingOptions = getSendingOptionsForTopicType(topic.type);
        if (topic.topicId !== undefined) {
            sendingOptions = {
                ...sendingOptions,
                message_thread_id: topic.topicId
            }
        }

        try {
            await telegramBot.telegram.sendMessage(topic.chatId, message, sendingOptions);
        } catch (error) {
            console.error(`Error sending Telegram message to chat ${topic.chatId} and topic ${topic.topicId}:`, error);
        }
    }

    async sendDirectMessage(telegramId: number, message: string): Promise<void> {
        try {
            await telegramBot.telegram.sendMessage(telegramId, message, { parse_mode: 'HTML' });
        } catch (error) {
            console.error(`Error sending Telegram message to user ${telegramId}:`, error);
        }
    }

    async sendDocument(topic: TelegramTopic, buffer: Buffer, filename: string, caption?: string): Promise<void> {
        try {
            await telegramBot.telegram.sendDocument(
                topic.chatId,
                { source: buffer, filename },
                {
                    parse_mode: 'HTML',
                    ...(topic.topicId !== undefined ? { message_thread_id: topic.topicId } : {}),
                    ...(caption !== undefined ? { caption } : {})
                }
            );
        } catch (error) {
            console.error(`Error sending Telegram document to chat ${topic.chatId} and topic ${topic.topicId}:`, error);
        }
    }
}

type SendMessageOptions = Omit<
    Parameters<ApiMethods<any>['sendMessage']>[0],
    'chat_id' | 'text'>;

function getSendingOptionsForTopicType(topicType: TelegramTopicType): SendMessageOptions {
    switch (topicType) {
        case TelegramTopicType.RATING:
            return {
                parse_mode: 'HTML',
                link_preview_options: {
                    is_disabled: true
                }
            };
        case TelegramTopicType.GAME_LOGS:
        case TelegramTopicType.USER_LOGS:
        case TelegramTopicType.CLUB_LOGS:
        case TelegramTopicType.ERROR_LOGS:
        case TelegramTopicType.MAIN:
            return { parse_mode: 'HTML' };
    }
}


export default new TelegramMessageService();
