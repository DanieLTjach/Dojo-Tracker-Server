import cron from 'node-cron';
import { telegramBot } from './TelegramBot.ts';
import { PollRepository } from '../repository/PollRepository.ts';
import { ClubService } from './ClubService.ts';
import type { ClubPollConfig } from '../model/PollModels.ts';
import type { TelegramTopic } from '../model/TelegramTopic.ts';
import LogService from './LogService.ts';

const KYIV_TIMEZONE = 'Europe/Kyiv';

const DAY_NAMES_UK: Record<number, string> = {
    0: 'неділя',
    1: 'понеділок',
    2: 'вівторок',
    3: 'середа',
    4: 'четвер',
    5: 'п\'ятниця',
    6: 'субота'
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

    private sendPoll(config: ClubPollConfig) {
        const pollTopic = this.clubService.getClubTelegramTopics(config.clubId).poll;
        if (pollTopic === null) {
            console.warn(`No poll topic configured for club ${config.clubId}, skipping poll`);
            return;
        }

        const options = this.buildPollOptions(config);

        void this.sendTelegramPoll(pollTopic, config.pollTitle, options);
    }

    private buildPollOptions(config: ClubPollConfig): string[] {
        const options: string[] = [];

        // Calculate upcoming dates for each event day
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: KYIV_TIMEZONE }));

        for (const eventDay of config.eventDays) {
            const date = getNextDayOfWeek(now, eventDay);
            const dayName = DAY_NAMES_UK[eventDay] ?? '';
            const formattedDate = `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
            options.push(`Буду ${formattedDate} ${dayName}`);
        }

        // Add extra options
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

/** Returns the next occurrence of the given day of week (1-7 days ahead, never today) */
function getNextDayOfWeek(from: Date, targetDay: number): Date {
    const result = new Date(from);
    const currentDay = from.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) {
        daysUntil += 7;
    }
    result.setDate(result.getDate() + daysUntil);
    return result;
}

export default new PollSchedulerService();
