import { Context } from "telegraf";
import config from "../../config/config.ts";
import { TelegramReplyError, UserNotClubOwnerTelegramError, UserNotRegisteredTelegramError } from "../error/TelegramErrors.ts";
import { ClubMembershipService } from "./ClubMembershipService.ts";
import LogService from "./LogService.ts";
import { telegramBot } from "./TelegramBot.ts";
import { UserService } from "./UserService.ts";
import type { CallbackQuery, Message, Update } from "telegraf/types";
import type { User } from "../model/UserModels.ts";
import { dbManager } from "../db/dbInit.ts";
import { ClubService, updateClubTelegramTopic } from "./ClubService.ts";
import { ClubTelegramTopicType } from "../model/TelegramTopic.ts";
import { parseClubTelegramTopicType } from "../util/EnumUtil.ts";
import { PollRepository } from "../repository/PollRepository.ts";
import type { ClubPollConfig } from "../model/PollModels.ts";
import PollSchedulerService from "./PollSchedulerService.ts";

type TelegramCommandContext = Context<{
    message: Update.New & Update.NonChannel & Message.TextMessage;
    update_id: number;
}>;

type TelegramCallbackQueryContext = Context<Update.CallbackQueryUpdate<CallbackQuery>> & { match: RegExpExecArray; };

type ClubData = { clubId: number; clubName: string };

class TelegramCommandService {

    private userService: UserService = new UserService();
    private clubService: ClubService = new ClubService();
    private clubMembershipService: ClubMembershipService = new ClubMembershipService();
    private pollRepository: PollRepository = new PollRepository();

    init() {
        telegramBot.command('set_topic', (ctx) => {
            this.executeWithErrorHandling(ctx, this.handleSetTopicCommand.bind(this));
        });

        telegramBot.command('post_app_link', (ctx) => {
            this.executeWithErrorHandling(ctx, this.handlePostAppLinkCommand.bind(this));
        });

        telegramBot.action(/select_topic_type_(\d+)(?:_(-?\d+))?/, async (ctx) => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handleSelectTopicTypeCallback.bind(this));
        });
        telegramBot.action(/set_topic_([A-Z_]+)_(\d+)(?:_(-?\d+))?/, async (ctx) => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handleSetTopicCallback.bind(this));
        });

        telegramBot.command('set_poll', (ctx) => {
            this.executeWithErrorHandling(ctx, this.handleSetPollCommand.bind(this));
        });
        telegramBot.action(/poll_club_(\d+)/, async (ctx) => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handlePollSelectClubCallback.bind(this));
        });
        telegramBot.action(/poll_day_(\d+)_(-?\d+)_(.*)/, async (ctx) => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handlePollToggleDayCallback.bind(this));
        });
        telegramBot.action(/poll_days_done_(\d+)_(.+)/, async (ctx) => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handlePollDaysDoneCallback.bind(this));
        });
        telegramBot.action(/poll_send_(\d+)_([^_]+)_(\d+)/, async (ctx) => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handlePollSendDayCallback.bind(this));
        });
        telegramBot.action(/poll_time_(\d+)_([^_]+)_(\d+)_(.+)/, async (ctx) => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handlePollTimeCallback.bind(this));
        });
        telegramBot.action(/poll_disable_(\d+)/, async (ctx) => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handlePollDisableCallback.bind(this));
        });

        telegramBot.command('preview_poll', (ctx) => {
            this.executeWithErrorHandling(ctx, this.handlePreviewPollCommand.bind(this));
        });
        telegramBot.command('send_poll', (ctx) => {
            this.executeWithErrorHandling(ctx, this.handleSendPollCommand.bind(this));
        });
        telegramBot.action(/send_poll_confirm_(\d+)/, async (ctx) => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handleSendPollConfirmCallback.bind(this));
        });

        telegramBot.launch(() => {
            console.log('Telegram bot started');
        }).catch(error => {
            LogService.logError('Telegram bot error: ', error);
        });
    }

    private handlePostAppLinkCommand(ctx: TelegramCommandContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        this.getUserOwnedClubData(user); // validates user is club owner/admin

        ctx.replyWithHTML('🀄 <b>Japan Dojo Tracker</b>\nНатисніть кнопку, щоб відкрити додаток', {
            reply_markup: {
                inline_keyboard: [[{
                    text: '📱 Відкрити',
                    url: config.botUrl
                }]]
            }
        });
    }

    private handleSetTopicCommand(ctx: TelegramCommandContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubData = this.getUserOwnedClubData(user);
        const messageTopicId = this.getMessageTopicId(ctx.message);

        ctx.reply('Виберіть клуб, для якого хочете встановити топік:', {
            reply_markup: {
                inline_keyboard: clubData.map(membership => ([{
                    text: membership.clubName,
                    callback_data: `select_topic_type_${membership.clubId}` + (messageTopicId !== undefined ? `_${messageTopicId}` : '')
                }]))
            }
        });
    }

    private async handleSelectTopicTypeCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const topicId = ctx.match[2] ? parseInt(ctx.match[2]) : undefined;

        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        ctx.reply('Виберіть, який топік ви хочете встановити:', {
            reply_markup: {
                inline_keyboard: Object.values(ClubTelegramTopicType).map(topicType => ([{
                    text: clubTelegramTopicDescription(topicType),
                    callback_data: `set_topic_${topicType}_${clubId}` + (topicId !== undefined ? `_${topicId}` : '')
                }]))
            }
        });
    }

    private async handleSetTopicCallback(ctx: TelegramCallbackQueryContext) {
        const topicType = parseClubTelegramTopicType(ctx.match[1]!);
        const clubId = parseInt(ctx.match[2]!);
        const topicId = ctx.match[3] ? parseInt(ctx.match[3]) : undefined;

        if (ctx.chat === undefined) {
            throw new Error(`Chat is missing in the callback context when processing set logging topic command for club ${clubId}`);
        }
        const chatId = ctx.chat.id;

        dbManager.db.transaction(() => {
            const user = this.getUserByTelegramId(ctx.from.id);
            this.validateUserCanEditClub(user, clubId);

            const clubTelegramTopics = this.clubService.getClubTelegramTopics(clubId);
            const updatedTopics = updateClubTelegramTopic(clubTelegramTopics, topicType, chatId, topicId);
            this.clubService.setClubTelegramTopics(clubId, updatedTopics, user.id);
        })();

        ctx.reply(clubTelegramTopicUpdatedSuccessfullyText(topicType));
    }

    // ── Poll wizard handlers ──

    private handleSetPollCommand(ctx: TelegramCommandContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubData = this.getUserOwnedClubData(user);

        ctx.reply('📊 Налаштування опитування.\nВиберіть клуб:', {
            reply_markup: {
                inline_keyboard: clubData.map(club => ([{
                    text: club.clubName,
                    callback_data: `poll_club_${club.clubId}`
                }]))
            }
        });
    }

    private handlePollSelectClubCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        const existingConfig = this.pollRepository.findConfigByClubId(clubId);
        if (existingConfig) {
            const club = this.clubService.getClubById(clubId);
            const daysText = existingConfig.eventDays.map(d => DAY_NAMES_SHORT[d]).join(', ');
            const sendDayText = DAY_NAMES_SHORT[existingConfig.sendDay];
            ctx.reply(
                `📊 Опитування для <b>${club.name}</b> вже налаштовано:\n\n`
                + `📝 ${existingConfig.pollTitle}\n`
                + `📅 Дні подій: ${daysText}\n`
                + `📤 Відправка: ${sendDayText} о ${existingConfig.sendTime}\n`
                + `${existingConfig.isActive ? '✅ Активне' : '❌ Вимкнене'}`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🔄 Переналаштувати', callback_data: `poll_day_${clubId}_-1_` }],
                            existingConfig.isActive
                                ? [{ text: '❌ Вимкнути', callback_data: `poll_disable_${clubId}` }]
                                : [{ text: '✅ Увімкнути', callback_data: `poll_disable_${clubId}` }]
                        ]
                    }
                }
            );
            return;
        }

        this.showDaySelector(ctx, clubId, '');
    }

    private handlePollToggleDayCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const toggleDay = parseInt(ctx.match[2]!);
        let selectedDays = ctx.match[3]! === '' ? [] : ctx.match[3]!.split(',').map(Number);

        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        // Toggle the day
        if (toggleDay >= 0) {
            if (selectedDays.includes(toggleDay)) {
                selectedDays = selectedDays.filter(d => d !== toggleDay);
            } else {
                selectedDays.push(toggleDay);
                selectedDays.sort((a, b) => a - b);
            }
        }

        this.showDaySelector(ctx, clubId, selectedDays.join(','));
    }

    private showDaySelector(ctx: TelegramCallbackQueryContext, clubId: number, daysStr: string) {
        const selectedDays = daysStr === '' ? [] : daysStr.split(',').map(Number);

        const dayButtons = ALL_DAYS.map(day => ({
            text: (selectedDays.includes(day) ? '✅ ' : '⬜ ') + DAY_NAMES_SHORT[day],
            callback_data: `poll_day_${clubId}_${day}_${daysStr}`
        }));

        const keyboard = [
            dayButtons.slice(0, 4),
            dayButtons.slice(4, 7),
            ...(selectedDays.length > 0
                ? [[{ text: '➡️ Далі', callback_data: `poll_days_done_${clubId}_${daysStr}` }]]
                : [])
        ];

        ctx.reply('Виберіть дні подій (натисніть щоб обрати/зняти):', {
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    private handlePollDaysDoneCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const daysStr = ctx.match[2]!;

        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        const dayButtons = ALL_DAYS.map(day => ([{
            text: DAY_NAMES_SHORT[day]!,
            callback_data: `poll_send_${clubId}_${daysStr}_${day}`
        }]));

        ctx.reply('В який день тижня відправляти опитування?', {
            reply_markup: { inline_keyboard: dayButtons }
        });
    }

    private handlePollSendDayCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const daysStr = ctx.match[2]!;
        const sendDay = parseInt(ctx.match[3]!);

        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        const timeOptions = ['09:00', '10:00', '12:00', '14:00', '16:00', '18:00'];
        const timeButtons = timeOptions.map(time => ([{
            text: time,
            callback_data: `poll_time_${clubId}_${daysStr}_${sendDay}_${time}`
        }]));

        ctx.reply('О котрій годині відправляти? (за київським часом)', {
            reply_markup: { inline_keyboard: timeButtons }
        });
    }

    private handlePollTimeCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const daysStr = ctx.match[2]!;
        const sendDay = parseInt(ctx.match[3]!);
        const sendTime = ctx.match[4]!;

        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        const club = this.clubService.getClubById(clubId);
        const eventDays = daysStr.split(',').map(Number);

        const pollConfig: ClubPollConfig = {
            clubId,
            pollTitle: club.name,
            eventDays,
            sendDay,
            sendTime,
            extraOptions: ['Результати 👀'],
            isActive: true
        };

        this.pollRepository.upsertConfig(pollConfig, user.id);

        const daysText = eventDays.map(d => DAY_NAMES_SHORT[d]).join(', ');
        ctx.reply(
            `✅ Опитування налаштовано!\n\n`
            + `📝 ${club.name}\n`
            + `📅 Дні подій: ${daysText}\n`
            + `📤 Відправка: ${DAY_NAMES_SHORT[sendDay]} о ${sendTime}\n\n`
            + `Не забудьте встановити топік для опитувань через /set_topic → 📊 Опитування`
        );
    }

    private handlePollDisableCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        const existingConfig = this.pollRepository.findConfigByClubId(clubId);
        if (!existingConfig) return;

        const newConfig = { ...existingConfig, isActive: !existingConfig.isActive };
        this.pollRepository.upsertConfig(newConfig, user.id);

        ctx.reply(newConfig.isActive
            ? '✅ Опитування увімкнено!'
            : '❌ Опитування вимкнено!'
        );
    }

    // ── Preview & Send poll handlers ──

    private handlePreviewPollCommand(ctx: TelegramCommandContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubData = this.getUserOwnedClubData(user);

        for (const club of clubData) {
            const pollConfig = this.pollRepository.findConfigByClubId(club.clubId);
            if (pollConfig) {
                const preview = PollSchedulerService.getPreview(pollConfig);
                ctx.replyWithHTML(preview);
                return;
            }
        }

        ctx.reply('Немає налаштованих опитувань. Використайте /set_poll');
    }

    private handleSendPollCommand(ctx: TelegramCommandContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubData = this.getUserOwnedClubData(user);

        const clubsWithPolls = clubData.filter(club =>
            this.pollRepository.findConfigByClubId(club.clubId) !== undefined
        );

        if (clubsWithPolls.length === 0) {
            ctx.reply('Немає налаштованих опитувань. Використайте /set_poll');
            return;
        }

        ctx.reply('Відправити опитування зараз?', {
            reply_markup: {
                inline_keyboard: clubsWithPolls.map(club => ([{
                    text: `📊 ${club.clubName}`,
                    callback_data: `send_poll_confirm_${club.clubId}`
                }]))
            }
        });
    }

    private handleSendPollConfirmCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        const pollConfig = this.pollRepository.findConfigByClubId(clubId);
        if (!pollConfig) {
            ctx.reply('Опитування не налаштовано для цього клубу.');
            return;
        }

        try {
            PollSchedulerService.sendPollNow(pollConfig);
            ctx.reply('✅ Опитування відправлено!');
        } catch (error) {
            ctx.reply('❌ Помилка: переконайтеся, що топік для опитувань встановлено через /set_topic');
        }
    }

    private getUserByTelegramId(userTelegramId: number): User {
        const user = this.userService.getOptionalUserByTelegramId(userTelegramId);
        if (user === undefined || !user.isActive) {
            throw new UserNotRegisteredTelegramError();
        }
        return user;
    }

    private validateUserCanEditClub(user: User, clubId: number) {
        const membership = this.clubMembershipService.getUserClubMembership(clubId, user.id);
        if (membership === undefined || !membership.permissions.canEditClub) {
            throw new UserNotClubOwnerTelegramError();
        }
    }

    private getUserOwnedClubData(user: User): ClubData[] {
        if (user.isAdmin) {
            return this.clubService.getAllActiveClubs()
                .map(club => ({ clubId: club.id, clubName: club.name }));
        }

        const clubData = this.clubMembershipService.getUserClubMemberships(user.id)
            .filter(membership => membership.permissions.canEditClub)
            .map(membership => ({ clubId: membership.clubId, clubName: membership.clubName }));

        if (clubData.length === 0) {
            throw new UserNotClubOwnerTelegramError();
        }

        return clubData;
    }

    private async executeCallbackQueryWithErrorHandling(
        ctx: TelegramCallbackQueryContext,
        code: (ctx: TelegramCallbackQueryContext) => Promise<void> | void
    ) {
        await this.executeWithErrorHandling(ctx, async (ctx) => {
            try {
                await code(ctx);
            } finally {
                // delete message with inline keyboard after selection
                try {
                    await ctx.deleteMessage();
                } catch (error) {
                    LogService.logError(`Error deleting Telegram message in chat ${ctx.chat?.id} while processing callback query from user ${ctx.from.id}: `, error);
                }
            }
        });
    }

    private async executeWithErrorHandling<C extends Context<U>, U extends Update>(
        ctx: C,
        code: (ctx: C) => Promise<void> | void
    ) {
        try {
            await code(ctx);
        } catch (e) {
            if (e instanceof TelegramReplyError) {
                ctx.reply(e.message);
            } else {
                LogService.logError('Unexpected error executing Telegram command: ', e);
                ctx.reply('Сталася помилка при виконанні команди. Спробуйте ще раз пізніше.');
            }
        }
    }

    private getMessageTopicId(message: Message.TextMessage): number | undefined {
        return message.is_topic_message ? message.message_thread_id : undefined;
    }
}

function clubTelegramTopicDescription(topicType: ClubTelegramTopicType): string {
    switch (topicType) {
        case ClubTelegramTopicType.RATING:
            return '📈 Рейтинг'
        case ClubTelegramTopicType.USER_LOGS:
            return '👤 Логи користувачів';
        case ClubTelegramTopicType.GAME_LOGS:
            return '🀄 Логи ігр';
        case ClubTelegramTopicType.CLUB_LOGS:
            return '🏛️ Логи клубу';
        case ClubTelegramTopicType.POLL:
            return '📊 Опитування';
    }
}

function clubTelegramTopicUpdatedSuccessfullyText(topicType: ClubTelegramTopicType): string {
    switch (topicType) {
        case ClubTelegramTopicType.RATING:
            return 'Топік для рейтингу успішно встановлено!';
        case ClubTelegramTopicType.USER_LOGS:
            return 'Топік для логів користувачів успішно встановлено!';
        case ClubTelegramTopicType.GAME_LOGS:
            return 'Топік для логів ігр успішно встановлено!';
        case ClubTelegramTopicType.CLUB_LOGS:
            return 'Топік для логів клубу успішно встановлено!';
        case ClubTelegramTopicType.POLL:
            return 'Топік для опитувань успішно встановлено!';
    }
}

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0]; // Mon-Sun

const DAY_NAMES_SHORT: Record<number, string> = {
    0: 'Нд', 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб'
};

export default new TelegramCommandService();
