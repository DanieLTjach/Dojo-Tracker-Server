import type { ApiMethods } from 'telegraf/types';
import config from '../../config/config.ts';
import { TelegramTopicType } from '../model/TelegramTopic.ts';
import type { TelegramTopic } from '../model/TelegramTopic.ts';
import LogService from './LogService.ts';
import { telegramBot } from './TelegramBot.ts';

class TelegramMessageService {
    async sendMessage(message: string, topic: TelegramTopic): Promise<void> {
        if (!config.telegramNotificationsEnabled) {
            return;
        }

        let sendingOptions = getSendingOptionsForTopicType(topic.type);
        if (topic.topicId !== undefined) {
            sendingOptions = {
                ...sendingOptions,
                message_thread_id: topic.topicId,
            };
        }

        try {
            await telegramBot.telegram.sendMessage(topic.chatId, message, sendingOptions);
        } catch (error) {
            console.error(`Error sending Telegram message to chat ${topic.chatId} and topic ${topic.topicId}:`, error);
        }
    }

    /**
     * Sends up to 10 photos as one album with the caption on the first item,
     * which is how Telegram renders a multi-photo post as a single message.
     * A one-photo album is sent as a plain photo so it does not render as a
     * collapsed group.
     *
     * Failures are logged, never thrown: a post is already saved by the time
     * this runs, and a Telegram outage must not fail the user's request.
     */
    async sendPhotos(imageUrls: string[], caption: string, topic: TelegramTopic): Promise<void> {
        if (!config.telegramNotificationsEnabled || imageUrls.length === 0) {
            return;
        }

        const threadOptions = topic.topicId !== undefined
            ? { message_thread_id: topic.topicId }
            : {};

        try {
            if (imageUrls.length === 1) {
                await telegramBot.telegram.sendPhoto(topic.chatId, imageUrls[0]!, {
                    caption,
                    parse_mode: 'HTML',
                    ...threadOptions,
                });
                return;
            }

            await telegramBot.telegram.sendMediaGroup(
                topic.chatId,
                imageUrls.map((url, index) => ({
                    type: 'photo' as const,
                    media: url,
                    // Only the first item carries the caption - Telegram shows
                    // one caption for the whole album.
                    ...(index === 0 ? { caption, parse_mode: 'HTML' as const } : {}),
                })),
                threadOptions
            );
        } catch (error) {
            LogService.logError(
                `Error sending Telegram photos to chat ${topic.chatId} topic ${topic.topicId}`,
                error
            );
        }
    }

    async sendDirectMessage(telegramId: number, message: string): Promise<void> {
        if (!config.telegramNotificationsEnabled) {
            return;
        }

        try {
            await telegramBot.telegram.sendMessage(telegramId, message, { parse_mode: 'HTML' });
        } catch (error) {
            console.error(`Error sending Telegram message to user ${telegramId}:`, error);
        }
    }
}

type SendMessageOptions = Omit<
    Parameters<ApiMethods<any>['sendMessage']>[0],
    'chat_id' | 'text'
>;

function getSendingOptionsForTopicType(topicType: TelegramTopicType): SendMessageOptions {
    switch (topicType) {
        case TelegramTopicType.RATING:
            return {
                parse_mode: 'HTML',
                link_preview_options: {
                    is_disabled: true,
                },
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
