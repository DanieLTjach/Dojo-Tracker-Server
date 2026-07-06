import { jest } from '@jest/globals';
import config from '../config/config.ts';
import { TelegramTopicType, type TelegramTopic } from '../src/model/TelegramTopic.ts';
import { telegramBot } from '../src/service/TelegramBot.ts';
import TelegramMessageService from '../src/service/TelegramMessageService.ts';

const topic: TelegramTopic = {
    type: TelegramTopicType.CLUB_LOGS,
    chatId: -100123,
    topicId: 456,
};

describe('TelegramMessageService notification switch', () => {
    const originalValue = config.telegramNotificationsEnabled;

    afterEach(() => {
        config.telegramNotificationsEnabled = originalValue;
        jest.restoreAllMocks();
    });

    test('does not send topic or direct notifications when disabled', async () => {
        config.telegramNotificationsEnabled = false;
        const sendMessageSpy = jest.spyOn(telegramBot.telegram, 'sendMessage');

        await TelegramMessageService.sendMessage('Topic notification', topic);
        await TelegramMessageService.sendDirectMessage(123, 'Direct notification');

        expect(sendMessageSpy).not.toHaveBeenCalled();
    });

    test('sends notifications normally when enabled', async () => {
        config.telegramNotificationsEnabled = true;
        const sendMessageSpy = jest.spyOn(telegramBot.telegram, 'sendMessage')
            .mockResolvedValue({} as Awaited<ReturnType<typeof telegramBot.telegram.sendMessage>>);

        await TelegramMessageService.sendMessage('Topic notification', topic);
        await TelegramMessageService.sendDirectMessage(123, 'Direct notification');

        expect(sendMessageSpy).toHaveBeenNthCalledWith(1, topic.chatId, 'Topic notification', {
            parse_mode: 'HTML',
            message_thread_id: topic.topicId,
        });
        expect(sendMessageSpy).toHaveBeenNthCalledWith(2, 123, 'Direct notification', {
            parse_mode: 'HTML',
        });
    });
});
