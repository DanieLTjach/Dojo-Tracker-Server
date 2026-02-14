import config from '../../config/config.ts';
import { Telegraf } from 'telegraf';
import type { TelegramTopic } from '../model/TelegramTopic.ts';

class TelegramService {
    private bot: Telegraf = new Telegraf(config.botToken);

    async sendMessage(message: string, topic: TelegramTopic) {
        const chatId = topic.getChatId();
        if (chatId === undefined) {
            return;
        }

        const topicId = topic.getTopicId();
        let sendingOptions = topic.getSendingOptions();
        if (topicId !== undefined) {
            sendingOptions = {
                ...sendingOptions,
                message_thread_id: topicId
            }
        }

        try {
            await this.bot.telegram.sendMessage(chatId, message, sendingOptions);
        } catch (error) {
            console.error('Error sending Telegram message:', error);
        }
    }
}

export default new TelegramService();
