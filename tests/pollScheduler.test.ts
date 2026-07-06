import { jest } from '@jest/globals';
import PollSchedulerService, { getNextDayOfWeek, formatDayName } from '../src/service/PollSchedulerService.ts';
import type { ClubPollConfig } from '../src/model/PollModels.ts';
import { telegramBot } from '../src/service/TelegramBot.ts';
import { TelegramTopicType, type TelegramTopic } from '../src/model/TelegramTopic.ts';
import LogService from '../src/service/LogService.ts';
import { t } from '../src/i18n/index.ts';

function makeConfig(overrides: Partial<ClubPollConfig> = {}): ClubPollConfig {
    return {
        clubId: 1,
        pollTitle: 'Japan Dojo',
        eventDays: [3, 5],
        sendDay: 1,
        sendTime: '10:00',
        extraOptions: ['Результати 👀'],
        isActive: true,
        ...overrides,
    };
}

describe('getNextDayOfWeek', () => {
    // Wednesday 2026-04-08
    const wednesday = new Date(2026, 3, 8);

    test('same day returns today', () => {
        const result = getNextDayOfWeek(wednesday, 3); // Wednesday
        expect(result.getDate()).toBe(8);
        expect(result.getMonth()).toBe(3);
    });

    test('future day in same week', () => {
        const result = getNextDayOfWeek(wednesday, 5); // Friday
        expect(result.getDate()).toBe(10);
        expect(result.getMonth()).toBe(3);
    });

    test('past day wraps to next week', () => {
        const result = getNextDayOfWeek(wednesday, 1); // Monday -> next week
        expect(result.getDate()).toBe(13);
        expect(result.getMonth()).toBe(3);
    });

    test('Sunday from Wednesday is +4 days', () => {
        const result = getNextDayOfWeek(wednesday, 7); // Sunday
        expect(result.getDate()).toBe(12);
    });

    test('Saturday from Sunday wraps correctly', () => {
        const sunday = new Date(2026, 3, 12); // Sunday
        const result = getNextDayOfWeek(sunday, 6); // Saturday -> next week
        expect(result.getDate()).toBe(18);
    });

    test('does not mutate the input date', () => {
        const original = new Date(2026, 3, 8);
        const originalTime = original.getTime();
        getNextDayOfWeek(original, 5);
        expect(original.getTime()).toBe(originalTime);
    });
});

describe('buildPollTitle', () => {
    test('same-month dates show condensed format', () => {
        // Wednesday 2026-04-08, eventDays Wed(3) + Fri(5) -> Apr 8, Apr 10
        const now = new Date(2026, 3, 8);
        const config = makeConfig({ eventDays: [3, 5] });

        const title = PollSchedulerService.buildPollTitle(config, 'uk', now);

        expect(title).toBe(t('telegram.poll.title', { dates: '8, 10 квітня' }));
    });

    test('cross-month dates show full format for each date', () => {
        // Monday 2026-03-30, eventDays Mon(1) + Fri(5) -> Mar 30, Apr 3
        const now = new Date(2026, 2, 30);
        const config = makeConfig({ eventDays: [1, 5] });

        const title = PollSchedulerService.buildPollTitle(config, 'uk', now);

        expect(title).toBe(t('telegram.poll.title', { dates: '30 березня, 3 квітня' }));
    });

    test('single event day', () => {
        const now = new Date(2026, 3, 8); // Wednesday
        const config = makeConfig({ eventDays: [5] }); // Friday only

        const title = PollSchedulerService.buildPollTitle(config, 'uk', now);

        expect(title).toBe(t('telegram.poll.title', { dates: '10 квітня' }));
    });

    test('event days are sorted chronologically regardless of input order', () => {
        const now = new Date(2026, 3, 8); // Wednesday
        const config = makeConfig({ eventDays: [5, 3] }); // Fri, Wed (reversed)

        const title = PollSchedulerService.buildPollTitle(config, 'uk', now);

        // Should still show Wed(8) before Fri(10)
        expect(title).toBe(t('telegram.poll.title', { dates: '8, 10 квітня' }));
    });
});

describe('buildPollOptions', () => {
    test('options are sorted by next occurrence', () => {
        const now = new Date(2026, 3, 8); // Wednesday
        const config = makeConfig({ eventDays: [5, 3], extraOptions: [] }); // Fri, Wed

        const options = PollSchedulerService.buildPollOptions(config, 'uk', now);

        // Wed(today) comes before Fri(+2 days)
        expect(options).toEqual(['Середа', 'П\u02BCятниця']);
    });

    test('extra options are appended after day names', () => {
        const now = new Date(2026, 3, 8);
        const config = makeConfig({ eventDays: [3], extraOptions: ['Результати 👀', 'У цей раз я пас'] });

        const options = PollSchedulerService.buildPollOptions(config, 'uk', now);

        expect(options).toEqual(['Середа', 'Результати 👀', 'У цей раз я пас']);
    });

    test('empty extra options', () => {
        const now = new Date(2026, 3, 8);
        const config = makeConfig({ eventDays: [3, 5], extraOptions: [] });

        const options = PollSchedulerService.buildPollOptions(config, 'uk', now);

        expect(options).toEqual(['Середа', 'П\u02BCятниця']);
    });
});

describe('sendTelegramPoll', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    const topic: TelegramTopic = {
        type: TelegramTopicType.MAIN,
        chatId: -100123456,
        topicId: 789,
    };

    type PollSender = {
        sendTelegramPoll(
            topic: TelegramTopic,
            question: string,
            options: string[]
        ): Promise<{ messageId: number | null, pinned: boolean }>;
    };

    function pollSender(): PollSender {
        return PollSchedulerService as unknown as PollSender;
    }

    test('pins sent poll silently', async () => {
        const sendPollSpy = jest.spyOn(telegramBot.telegram, 'sendPoll')
            .mockResolvedValue({ message_id: 321 } as Awaited<ReturnType<typeof telegramBot.telegram.sendPoll>>);
        const pinChatMessageSpy = jest.spyOn(telegramBot.telegram, 'pinChatMessage')
            .mockResolvedValue(true);

        const result = await pollSender().sendTelegramPoll(topic, 'Poll question', ['Yes', 'No']);

        expect(sendPollSpy).toHaveBeenCalledWith(topic.chatId, 'Poll question', ['Yes', 'No'], {
            is_anonymous: false,
            allows_multiple_answers: true,
            message_thread_id: topic.topicId,
        });
        expect(pinChatMessageSpy).toHaveBeenCalledWith(topic.chatId, 321, {
            disable_notification: true,
        });
        expect(result).toEqual({ messageId: 321, pinned: true });
    });

    test('logs and returns pin failure without failing the poll send', async () => {
        const pinError = new Error('not enough rights');
        jest.spyOn(telegramBot.telegram, 'sendPoll')
            .mockResolvedValue({ message_id: 654 } as Awaited<ReturnType<typeof telegramBot.telegram.sendPoll>>);
        jest.spyOn(telegramBot.telegram, 'pinChatMessage').mockRejectedValue(pinError);
        const logErrorSpy = jest.spyOn(LogService, 'logError').mockImplementation(() => undefined);

        const result = await pollSender().sendTelegramPoll(topic, 'Poll question', ['Yes', 'No']);

        expect(logErrorSpy).toHaveBeenCalledWith(
            `Error pinning poll message 654 in chat ${topic.chatId} topic ${topic.topicId}`,
            pinError
        );
        expect(logErrorSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('Error sending poll'),
            expect.anything()
        );
        expect(result).toEqual({ messageId: 654, pinned: false });
    });

    test('returns send failure when Telegram rejects the poll', async () => {
        const sendError = new Error('chat not found');
        jest.spyOn(telegramBot.telegram, 'sendPoll').mockRejectedValue(sendError);
        const pinChatMessageSpy = jest.spyOn(telegramBot.telegram, 'pinChatMessage');
        const logErrorSpy = jest.spyOn(LogService, 'logError').mockImplementation(() => undefined);

        const result = await pollSender().sendTelegramPoll(topic, 'Poll question', ['Yes', 'No']);

        expect(logErrorSpy).toHaveBeenCalledWith(
            `Error sending poll to chat ${topic.chatId} topic ${topic.topicId}`,
            sendError
        );
        expect(pinChatMessageSpy).not.toHaveBeenCalled();
        expect(result).toEqual({ messageId: null, pinned: false });
    });
});

describe('formatDayName', () => {
    test('capitalizes the first letter', () => {
        const wednesday = new Date(2026, 3, 8);
        const name = formatDayName(wednesday, 'uk');
        expect(name.charAt(0)).toBe(name.charAt(0).toUpperCase());
        expect(name).toBe('Середа');
    });
});
