import config from '../../config/config.ts';
import TelegramService from './TelegramSevice.ts';
import escapeHtml from 'escape-html';

interface LogMessage {
    message: string;
    chatType: 'admin' | 'rating';
}

class LogService {
    private messageQueue: LogMessage[] = [];
    private isRunning: boolean = false;

    constructor() {
        if (config.env !== 'test') {
            this.isRunning = true;
            this.processQueue(); 
        }
    }

    async shutdown() {
        this.isRunning = false;
        await this.flushQueue();
    }

    logInfo(message: string) {
        console.log(message);
        this.messageQueue.push({ message, chatType: 'admin' });
    }

    logError(message: string, error: Error | null = null) {
        console.error(message, error);
        const errorDetails = error ? `${escapeHtml(error.message)}\n<pre>${escapeHtml(error.stack || '')}</pre>` : '';
        this.messageQueue.push({ message: `<b>❌ ERROR</b>\n${escapeHtml(message)} ${errorDetails}`, chatType: 'admin' });
    }

    logRatingUpdate(message: string) {
        console.log(message);
        this.messageQueue.push({ message, chatType: 'rating' });
    }

    private async processQueue() {
        while (this.isRunning) {
            try {
                const queuedMessage = this.messageQueue.shift();
                if (queuedMessage !== undefined) {
                    await this.sendMessageToTelegram(queuedMessage);
                } else {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (error) {
                console.error('Error processing queued Telegram messages:', error);
            }
        }
    }

    private async flushQueue() {
        const maxWaitTime = 5000; // 5 seconds max
        const startTime = Date.now();
        console.log('Flushing LogService message queue');

        while (this.messageQueue.length > 0 && (Date.now() - startTime) < maxWaitTime) {
            const queuedMessage = this.messageQueue.shift();
            if (queuedMessage) {
                try {
                    await this.sendMessageToTelegram(queuedMessage);
                } catch (error) {
                    console.error('Error flushing queued message:', error);
                }
            }
        }
    }

    private async sendMessageToTelegram(message: LogMessage): Promise<void> {
        if (message.chatType === 'admin') {
            await TelegramService.sendMessageToAdminChat(message.message);
        } else if (message.chatType === 'rating') {
            await TelegramService.sendMessageToRatingTopic(message.message);
        }
    }
}

export default new LogService();
