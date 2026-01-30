import config from '../../config/config.ts';
import { Telegraf } from 'telegraf';

class TelegramService {
    private bot: Telegraf = new Telegraf(config.botToken);

    async sendMessageToAdminChat(message: string) {
        if (config.adminChatId) {
            try {
                await this.bot.telegram.sendMessage(config.adminChatId, message, { parse_mode: 'HTML' });
            } catch (error) {
                console.error('Error sending Telegram message:', error);
            }
        }
    }

    async sendMessageToRatingTopic(message: string) {
        if (config.ratingChatId && config.ratingTopicId) {
            try {
                await this.bot.telegram.sendMessage(
                    config.ratingChatId,
                    message,
                    {
                        parse_mode: 'HTML',
                        message_thread_id: config.ratingTopicId,
                        link_preview_options: {
                            is_disabled: true
                        }
                    }
                );
            } catch (error) {
                console.error('Error sending Telegram message to rating topic:', error);
            }
        }
    }

}

export default new TelegramService();
