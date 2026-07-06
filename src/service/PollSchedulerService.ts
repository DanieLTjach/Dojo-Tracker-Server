import cron from 'node-cron';
import { telegramBot } from './TelegramBot.ts';
import { PollRepository } from '../repository/PollRepository.ts';
import { ClubService } from './ClubService.ts';
import type { ClubPollConfig } from '../model/PollModels.ts';
import type { TelegramTopic } from '../model/TelegramTopic.ts';
import LogService from './LogService.ts';
import { SupportedLocale, t } from '../i18n/index.ts';
import { resolveClubLocale } from '../util/LocaleResolver.ts';

const KYIV_TIMEZONE = 'Europe/Kyiv';

const dayFormatters = new Map<SupportedLocale, Intl.DateTimeFormat>();
const monthDayFormatters = new Map<SupportedLocale, Intl.DateTimeFormat>();

function dayFormatter(locale: SupportedLocale): Intl.DateTimeFormat {
    let formatter = dayFormatters.get(locale);
    if (formatter === undefined) {
        formatter = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: KYIV_TIMEZONE });
        dayFormatters.set(locale, formatter);
    }
    return formatter;
}

function monthDayFormatter(locale: SupportedLocale): Intl.DateTimeFormat {
    let formatter = monthDayFormatters.get(locale);
    if (formatter === undefined) {
        formatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: KYIV_TIMEZONE });
        monthDayFormatters.set(locale, formatter);
    }
    return formatter;
}

export function formatDayName(date: Date, locale: SupportedLocale): string {
    const name = dayFormatter(locale).format(date);
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function formatMonthName(date: Date, locale: SupportedLocale): string {
    const parts = monthDayFormatter(locale).formatToParts(date);
    return parts.find(p => p.type === 'month')!.value;
}

function nowInKyiv(): Date {
    return new Date(new Date().toLocaleString('en-US', { timeZone: KYIV_TIMEZONE }));
}

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

        const locale = resolveClubLocale(this.clubService.getClubById(config.clubId));
        return await this.sendTelegramPoll(
            pollTopic,
            this.buildPollTitle(config, locale),
            this.buildPollOptions(config, locale)
        );
    }

    private sendScheduledPoll(config: ClubPollConfig) {
        const pollTopic = this.clubService.getClubTelegramTopics(config.clubId).main;
        if (pollTopic === null) {
            LogService.logError(`No main topic configured for club ${config.clubId}, skipping poll`);
            return;
        }

        const locale = resolveClubLocale(this.clubService.getClubById(config.clubId));
        void this.sendTelegramPoll(
            pollTopic,
            this.buildPollTitle(config, locale),
            this.buildPollOptions(config, locale)
        );
    }

    buildPollTitle(config: ClubPollConfig, locale: SupportedLocale, now: Date = nowInKyiv()): string {
        const dates = config.eventDays.map(day => getNextDayOfWeek(now, day));
        dates.sort((a, b) => a.getTime() - b.getTime());

        const firstMonth = dates[0]!.getMonth();
        const sameMonth = dates.every(d => d.getMonth() === firstMonth);

        const datesText = sameMonth
            ? `${dates.map(d => d.getDate()).join(', ')} ${formatMonthName(dates[0]!, locale)}`
            : dates.map(d => `${d.getDate()} ${formatMonthName(d, locale)}`).join(', ');

        return t('telegram.poll.title', locale, { dates: datesText });
    }

    buildPollOptions(config: ClubPollConfig, locale: SupportedLocale, now: Date = nowInKyiv()): string[] {
        const sortedDates = config.eventDays
            .map(day => ({ day, date: getNextDayOfWeek(now, day) }))
            .sort((a, b) => a.date.getTime() - b.date.getTime());
        const options: string[] = sortedDates.map(({ date }) => formatDayName(date, locale));
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
