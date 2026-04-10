import cron from 'node-cron';
import { telegramBot } from './TelegramBot.ts';
import { PollRepository } from '../repository/PollRepository.ts';
import { ClubService } from './ClubService.ts';
import type { ClubPollConfig } from '../model/PollModels.ts';
import type { TelegramTopic } from '../model/TelegramTopic.ts';
import LogService from './LogService.ts';

const KYIV_TIMEZONE = 'Europe/Kyiv';

const DAY_NAMES_UK: Record<number, string> = {
    0: 'Неділя',
    1: 'Понеділок',
    2: 'Вівторок',
    3: 'Середа',
    4: 'Четвер',
    5: 'П\'ятниця',
    6: 'Субота'
};

const MONTH_NAMES_UK_GENITIVE: Record<number, string> = {
    0: 'січня', 1: 'лютого', 2: 'березня', 3: 'квітня',
    4: 'травня', 5: 'червня', 6: 'липня', 7: 'серпня',
    8: 'вересня', 9: 'жовтня', 10: 'листопада', 11: 'грудня'
};

class PollSchedulerService {
    private pollRepository: PollRepository = new PollRepository();
    private clubService: ClubService = new ClubService();

    init() {
        // Check every minute if any poll needs to be sent
        cron.schedule('* * * * *', () => {
            this.checkAndSendPolls();
        }, { timezone: KYIV_TIMEZONE });

        console.log('Poll scheduler started');
    }

    private checkAndSendPolls() {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: KYIV_TIMEZONE }));
        const currentDay = now.getDay();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        const configs = this.pollRepository.findAllActiveConfigs();

        for (const config of configs) {
            if (config.sendDay === currentDay && config.sendTime === currentTime) {
                this.sendPoll(config);
            }
        }
    }

    sendPollNow(config: ClubPollConfig) {
        const pollTopic = this.clubService.getClubTelegramTopics(config.clubId).poll;
        if (pollTopic === null) {
            throw new Error(`No poll topic configured for club ${config.clubId}`);
        }

        const title = this.buildPollTitle(config);
        const options = this.buildPollOptions(config);
        void this.sendTelegramPoll(pollTopic, title, options);
    }

    private sendPoll(config: ClubPollConfig) {
        const pollTopic = this.clubService.getClubTelegramTopics(config.clubId).poll;
        if (pollTopic === null) {
            console.warn(`No poll topic configured for club ${config.clubId}, skipping poll`);
            return;
        }

        const title = this.buildPollTitle(config);
        const options = this.buildPollOptions(config);
        void this.sendTelegramPoll(pollTopic, title, options);
    }

    buildPollTitle(config: ClubPollConfig): string {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: KYIV_TIMEZONE }));
        const dates = config.eventDays.map(day => getNextDayOfWeek(now, day));
        dates.sort((a, b) => a.getTime() - b.getTime());

        const days = dates.map(d => d.getDate());
        const month = MONTH_NAMES_UK_GENITIVE[dates[0]!.getMonth()]!;

        return `🀄 Маджонг ${days.join(', ')} ${month}`;
    }

    buildPollOptions(config: ClubPollConfig): string[] {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: KYIV_TIMEZONE }));
        const sortedDays = [...config.eventDays].sort((a, b) =>
            getNextDayOfWeek(now, a).getTime() - getNextDayOfWeek(now, b).getTime()
        );
        const options: string[] = sortedDays.map(day => DAY_NAMES_UK[day] ?? '');
        options.push(...config.extraOptions);
        return options;
    }

    private async sendTelegramPoll(topic: TelegramTopic, question: string, options: string[]) {
        try {
            await telegramBot.telegram.sendPoll(topic.chatId, question, options, {
                is_anonymous: false,
                allows_multiple_answers: true,
                ...(topic.topicId !== undefined && { message_thread_id: topic.topicId })
            });
        } catch (error) {
            LogService.logError(`Error sending poll to chat ${topic.chatId} topic ${topic.topicId}`, error);
        }
    }
}

/** Returns the next occurrence of the given day of week (0-6 days ahead, including today) */
function getNextDayOfWeek(from: Date, targetDay: number): Date {
    const result = new Date(from);
    const currentDay = from.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil < 0) {
        daysUntil += 7;
    }
    result.setDate(result.getDate() + daysUntil);
    return result;
}

export default new PollSchedulerService();
