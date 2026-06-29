import cron from 'node-cron';
import { telegramBot } from './TelegramBot.ts';
import { SYSTEM_USER_ID } from '../../config/constants.ts';
import { PollRepository } from '../repository/PollRepository.ts';
import { ClubService } from './ClubService.ts';
import type { ClubPollConfig } from '../model/PollModels.ts';
import type { TelegramTopic } from '../model/TelegramTopic.ts';
import { UsageAction } from '../model/UsageModels.ts';
import LogService from './LogService.ts';
import { UsageService } from './UsageService.ts';

const KYIV_TIMEZONE = 'Europe/Kyiv';
const LOCALE = 'uk-UA';

const dayFormatter = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', timeZone: KYIV_TIMEZONE });
const monthDayFormatter = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', timeZone: KYIV_TIMEZONE });

export function formatDayName(date: Date): string {
    const name = dayFormatter.format(date);
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function formatMonthName(date: Date): string {
    const parts = monthDayFormatter.formatToParts(date);
    return parts.find(p => p.type === 'month')!.value;
}

function nowInKyiv(): Date {
    return new Date(new Date().toLocaleString('en-US', { timeZone: KYIV_TIMEZONE }));
}

class PollSchedulerService {
    private pollRepository: PollRepository = new PollRepository();
    private clubService: ClubService = new ClubService();
    private usageService: UsageService = new UsageService();

    init() {
        // Check every minute if any poll needs to be sent
        cron.schedule('* * * * *', () => {
            this.checkAndSendPolls();
        }, { timezone: KYIV_TIMEZONE });

        console.log('Poll scheduler started');
    }

    private checkAndSendPolls() {
        const now = nowInKyiv();
        const currentDay = jsToIsoDay(now.getDay());
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        const configs = this.pollRepository.findAllActiveConfigs();

        for (const config of configs) {
            if (config.sendDay === currentDay && config.sendTime === currentTime) {
                this.sendScheduledPoll(config);
            }
        }
    }

    async sendPollNow(config: ClubPollConfig): Promise<TelegramPollSendResult> {
        const pollTopic = this.clubService.getClubTelegramTopics(config.clubId).main;
        if (pollTopic === null) {
            throw new Error(`No main topic configured for club ${config.clubId}`);
        }

        return await this.sendBillableTelegramPoll(config, pollTopic);
    }

    private sendScheduledPoll(config: ClubPollConfig) {
        const pollTopic = this.clubService.getClubTelegramTopics(config.clubId).main;
        if (pollTopic === null) {
            LogService.logError(`No main topic configured for club ${config.clubId}, skipping poll`);
            return;
        }

        void this.sendBillableTelegramPoll(config, pollTopic).catch(error => {
            LogService.logError(`Error billing or sending scheduled poll for club ${config.clubId}`, error);
        });
    }

    buildPollTitle(config: ClubPollConfig, now: Date = nowInKyiv()): string {
        const dates = config.eventDays.map(day => getNextDayOfWeek(now, day));
        dates.sort((a, b) => a.getTime() - b.getTime());

        const firstMonth = dates[0]!.getMonth();
        const sameMonth = dates.every(d => d.getMonth() === firstMonth);

        const datesText = sameMonth
            ? `${dates.map(d => d.getDate()).join(', ')} ${formatMonthName(dates[0]!)}`
            : dates.map(d => `${d.getDate()} ${formatMonthName(d)}`).join(', ');

        return `🀄 Маджонг ${datesText}`;
    }

    buildPollOptions(config: ClubPollConfig, now: Date = nowInKyiv()): string[] {
        const sortedDates = config.eventDays
            .map(day => ({ day, date: getNextDayOfWeek(now, day) }))
            .sort((a, b) => a.date.getTime() - b.date.getTime());
        const options: string[] = sortedDates.map(({ date }) => formatDayName(date));
        options.push(...config.extraOptions);
        return options;
    }

    private async sendTelegramPoll(
        topic: TelegramTopic,
        question: string,
        options: string[]
    ): Promise<TelegramPollSendResult> {
        try {
            const pollMessage = await telegramBot.telegram.sendPoll(topic.chatId, question, options, {
                is_anonymous: false,
                allows_multiple_answers: true,
                ...(topic.topicId !== undefined && { message_thread_id: topic.topicId }),
            });
            return {
                messageId: pollMessage.message_id,
                pinned: await this.pinTelegramPoll(topic, pollMessage.message_id),
            };
        } catch (error) {
            LogService.logError(`Error sending poll to chat ${topic.chatId} topic ${topic.topicId}`, error);
            return { messageId: null, pinned: false };
        }
    }

    private async sendBillableTelegramPoll(
        config: ClubPollConfig,
        topic: TelegramTopic
    ): Promise<TelegramPollSendResult> {
        const reservation = await this.usageService.reserveCharge({
            clubId: config.clubId,
            action: UsageAction.POLL_SENT,
            modifiedBy: SYSTEM_USER_ID,
        });

        try {
            const result = await this.sendTelegramPoll(
                topic,
                this.buildPollTitle(config),
                this.buildPollOptions(config)
            );
            if (result.messageId === null) {
                await this.usageService.refundReservation(reservation);
                return result;
            }

            await this.usageService.finalizeReservation(reservation);
            return result;
        } catch (error) {
            await this.usageService.refundReservation(reservation);
            throw error;
        }
    }

    private async pinTelegramPoll(topic: TelegramTopic, messageId: number): Promise<boolean> {
        try {
            await telegramBot.telegram.pinChatMessage(topic.chatId, messageId, {
                disable_notification: true,
            });
            return true;
        } catch (error) {
            LogService.logError(
                `Error pinning poll message ${messageId} in chat ${topic.chatId} topic ${topic.topicId}`,
                error
            );
            return false;
        }
    }
}

interface TelegramPollSendResult {
    messageId: number | null;
    pinned: boolean;
}

/** Converts JS day (0=Sunday) to ISO day (7=Sunday, 1=Monday) */
function jsToIsoDay(jsDay: number): number {
    return jsDay === 0 ? 7 : jsDay;
}

/** Returns the next occurrence of the given ISO day of week (1=Mon, 7=Sun), 0-6 days ahead including today */
export function getNextDayOfWeek(from: Date, targetDay: number): Date {
    const result = new Date(from);
    const currentDay = jsToIsoDay(from.getDay());
    let daysUntil = targetDay - currentDay;
    if (daysUntil < 0) {
        daysUntil += 7;
    }
    result.setDate(result.getDate() + daysUntil);
    return result;
}

export default new PollSchedulerService();
