import TelegramService from './TelegramSevice.ts';
import escapeHtml from 'escape-html';

interface LogMessage {
    message: string;
    chatType: 'admin' | 'rating';
}

class LogService {
    private messageQueue: LogMessage[] = [];

    constructor() {
        this.processQueue();
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
        while (true) {
            try {
                const queuedMessage = this.messageQueue.shift();
                if (queuedMessage !== undefined) {
                    if (queuedMessage.chatType === 'admin') {
                        await TelegramService.sendMessageToAdminChat(queuedMessage.message);
                    } else if (queuedMessage.chatType === 'rating') {
                        await TelegramService.sendMessageToRatingTopic(queuedMessage.message);
                    }
                } else {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            } catch (error) {
                console.error('Error processing queued Telegram messages:', error);
            }
        }
    }
}

export default new LogService();
