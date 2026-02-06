import config from '../../config/config.ts';
import { ErrorLogsTopic } from '../model/TelegramTopic.ts';
import type { TelegramTopic } from '../model/TelegramTopic.ts';
import TelegramService from './TelegramSevice.ts';
import escapeHtml from 'escape-html';

interface LogMessage {
    message: string;
    topic: TelegramTopic;
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

    logInfo(message: string, topic: TelegramTopic) {
        console.log(message);
        this.messageQueue.push({ message, topic });
    }

    logError(message: string, error: Error | null = null) {
        console.error(message, error);
        const errorDetails = error ? `${escapeHtml(error.message)}\n<pre>${escapeHtml(error.stack || '')}</pre>` : '';
        this.messageQueue.push({
            message: `<b>❌ ERROR</b>\n${escapeHtml(message)} ${errorDetails}`,
            topic: ErrorLogsTopic
        });
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
        await TelegramService.sendMessage(message.message, message.topic);
    }
}

export default new LogService();
