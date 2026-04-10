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

export default new TelegramCommandService();
