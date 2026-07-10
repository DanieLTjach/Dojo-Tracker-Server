import { Context } from 'telegraf';
import { message } from 'telegraf/filters';
import dedent from 'dedent';
import config from '../../config/config.ts';
import {
    NoActiveInvitesTelegramError,
    TelegramReplyError,
    UserNotAdminTelegramError,
    UserNotClubOwnerTelegramError,
    UserNotRegisteredTelegramError,
} from '../error/TelegramErrors.ts';
import { ClubMembershipService } from './ClubMembershipService.ts';
import { ClubInviteService } from './ClubInviteService.ts';
import { ClubInviteSource, ClubInviteType } from '../model/ClubModels.ts';
import type { ClubInvite } from '../model/ClubModels.ts';
import { generateQrPng } from '../util/QrCodeUtil.ts';
import LogService from './LogService.ts';
import { telegramBot } from './TelegramBot.ts';
import { UserService } from './UserService.ts';
import type { CallbackQuery, Message, Update } from 'telegraf/types';
import type { User } from '../model/UserModels.ts';
import { dbManager } from '../db/dbInit.ts';
import { ClubService, updateClubTelegramTopic, unsetClubTelegramTopic } from './ClubService.ts';
import { ClubTelegramTopicType } from '../model/TelegramTopic.ts';
import type { TelegramTopic } from '../model/TelegramTopic.ts';
import type { ClubTelegramTopics } from '../model/ClubModels.ts';
import TelegramMessageService from './TelegramMessageService.ts';
import { parseClubTelegramTopicType } from '../util/EnumUtil.ts';
import { PollRepository } from '../repository/PollRepository.ts';
import type { ClubPollConfig } from '../model/PollModels.ts';
import PollSchedulerService from './PollSchedulerService.ts';
import { EventService } from './EventService.ts';
import { TournamentRoundImportService } from './TournamentRoundImportService.ts';
import { DEFAULT_LOCALE, SupportedLocale, t } from '../i18n/index.ts';
import { resolveClubLocale, resolveUserLocale } from '../util/LocaleResolver.ts';

type TelegramCommandContext =
    & Context<{
        message: Update.New & Update.NonChannel & Message.TextMessage;
        update_id: number;
    }>
    & { locale: SupportedLocale };

type TelegramCallbackQueryRawContext = Context<Update.CallbackQueryUpdate<CallbackQuery>> & { match: RegExpExecArray };
type TelegramCallbackQueryContext = TelegramCallbackQueryRawContext & { locale: SupportedLocale };

type ClubData = { clubId: number, clubName: string };

type TournamentImportStep = 'awaiting_round' | 'awaiting_data';

type TournamentImportPending = {
    eventId: number;
    step: TournamentImportStep;
    round?: number;
    updatedAt: number;
};

const PENDING_TTL_MS = 30 * 60 * 1000;

class TelegramCommandService {
    private userService: UserService = new UserService();
    private clubService: ClubService = new ClubService();
    private clubMembershipService: ClubMembershipService = new ClubMembershipService();
    private clubInviteService: ClubInviteService = new ClubInviteService();
    private pollRepository: PollRepository = new PollRepository();
    private eventService: EventService = new EventService();
    private tournamentRoundImportService: TournamentRoundImportService = new TournamentRoundImportService();
    private tournamentImportPending = new Map<number, TournamentImportPending>();

    init() {
        telegramBot.command('help', ctx => {
            this.executeWithErrorHandling(ctx, this.handleHelpCommand.bind(this));
        });

        telegramBot.command('set_topic', ctx => {
            this.executeWithErrorHandling(ctx, this.handleSetTopicCommand.bind(this));
        });

        telegramBot.command('unset_topic', ctx => {
            this.executeWithErrorHandling(ctx, this.handleUnsetTopicCommand.bind(this));
        });

        telegramBot.command('diagnose_topics', ctx => {
            this.executeWithErrorHandling(ctx, this.handleDiagnoseTopicsCommand.bind(this));
        });

        telegramBot.command('post_app_link', ctx => {
            this.executeWithErrorHandling(ctx, this.handlePostAppLinkCommand.bind(this));
        });

        telegramBot.action(/select_topic_type_(\d+)(?:_(-?\d+))?/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handleSelectTopicTypeCallback.bind(this));
        });
        telegramBot.action(/set_topic_([A-Z_]+)_(\d+)(?:_(-?\d+))?/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handleSetTopicCallback.bind(this));
        });

        telegramBot.action(/select_unset_topic_type_(\d+)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handleSelectUnsetTopicTypeCallback.bind(this));
        });
        telegramBot.action(/unset_topic_([A-Z_]+)_(\d+)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handleUnsetTopicCallback.bind(this));
        });
        telegramBot.action(/diagnose_topics_club_(\d+)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handleDiagnoseTopicsClubCallback.bind(this));
        });
        telegramBot.action(/test_topic_([A-Z_]+)_(\d+)/, async ctx => {
            // Note: do NOT use executeCallbackQueryWithErrorHandling — it deletes the message,
            // and we want the diagnose panel with all test buttons to remain interactable.
            await this.executeWithErrorHandling(ctx, this.handleTestTopicCallback.bind(this));
        });

        telegramBot.command('setup_poll', ctx => {
            this.executeWithErrorHandling(ctx, this.handleSetPollCommand.bind(this));
        });
        telegramBot.action(/poll_club_(\d+)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handlePollSelectClubCallback.bind(this));
        });
        telegramBot.action(/poll_day_(\d+)_(-?\d+)_(.*)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handlePollToggleDayCallback.bind(this));
        });
        telegramBot.action(/poll_days_done_(\d+)_(.+)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handlePollDaysDoneCallback.bind(this));
        });
        telegramBot.action(/poll_send_(\d+)_([^_]+)_(\d+)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handlePollSendDayCallback.bind(this));
        });
        telegramBot.action(/poll_time_(\d+)_([^_]+)_(\d+)_(.+)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handlePollTimeCallback.bind(this));
        });
        telegramBot.action(/poll_extra_(\d+)_([^_]+)_(\d+)_([^_]+)_(\d+)_(.*)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handlePollToggleExtraCallback.bind(this));
        });
        telegramBot.action(/poll_extras_done_(\d+)_([^_]+)_(\d+)_([^_]+)_(.*)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handlePollExtrasDoneCallback.bind(this));
        });
        telegramBot.action(/poll_toggle_(\d+)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handlePollToggleCallback.bind(this));
        });

        telegramBot.command('preview_poll', ctx => {
            this.executeWithErrorHandling(ctx, this.handlePreviewPollCommand.bind(this));
        });
        telegramBot.action(/preview_poll_confirm_(\d+)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handlePreviewPollConfirmCallback.bind(this));
        });
        telegramBot.command('send_poll', ctx => {
            this.executeWithErrorHandling(ctx, this.handleSendPollCommand.bind(this));
        });
        telegramBot.action(/send_poll_confirm_(\d+)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handleSendPollConfirmCallback.bind(this));
        });

        telegramBot.command('import_tournament_round', ctx => {
            this.executeWithErrorHandling(ctx, this.handleImportTournamentRoundCommand.bind(this));
        });
        telegramBot.action(/import_round_event_(\d+)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handleImportRoundEventCallback.bind(this));
        });

        telegramBot.command('create_invite', ctx => {
            this.executeWithErrorHandling(ctx, this.handleCreateInviteCommand.bind(this));
        });
        telegramBot.action(/inv_c_(\d+)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handleCreateInviteClubCallback.bind(this));
        });
        telegramBot.action(/inv_t_(\d+)_([JR])/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handleCreateInviteTypeCallback.bind(this));
        });
        telegramBot.action(/inv_s_(\d+)_([JR])_(\d+)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handleCreateInviteSourceCallback.bind(this));
        });

        telegramBot.command('list_invites', ctx => {
            this.executeWithErrorHandling(ctx, this.handleListInvitesCommand.bind(this));
        });
        telegramBot.action(/invl_c_(\d+)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handleListInvitesClubCallback.bind(this));
        });

        telegramBot.command('revoke_invite', ctx => {
            this.executeWithErrorHandling(ctx, this.handleRevokeInviteCommand.bind(this));
        });
        telegramBot.action(/invr_c_(\d+)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handleRevokeInviteClubCallback.bind(this));
        });
        telegramBot.action(/invr_p_(\d+)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handleRevokeInvitePickCallback.bind(this));
        });
        telegramBot.action(/invr_x_(\d+)/, async ctx => {
            await this.executeCallbackQueryWithErrorHandling(ctx, this.handleRevokeInviteConfirmCallback.bind(this));
        });
        telegramBot.on(message('text'), ctx => {
            this.executeWithErrorHandling(ctx, this.handleTextMessage.bind(this));
        });

        telegramBot.telegram.setMyCommands([
            { command: 'help', description: t('telegram.commands.help', DEFAULT_LOCALE) },
            { command: 'post_app_link', description: t('telegram.commands.postAppLink', DEFAULT_LOCALE) },
            { command: 'set_topic', description: t('telegram.commands.setTopic', DEFAULT_LOCALE) },
            { command: 'unset_topic', description: t('telegram.commands.unsetTopic', DEFAULT_LOCALE) },
            { command: 'diagnose_topics', description: t('telegram.commands.diagnoseTopics', DEFAULT_LOCALE) },
            { command: 'setup_poll', description: t('telegram.commands.setupPoll', DEFAULT_LOCALE) },
            { command: 'preview_poll', description: t('telegram.commands.previewPoll', DEFAULT_LOCALE) },
            { command: 'send_poll', description: t('telegram.commands.sendPoll', DEFAULT_LOCALE) },
            { command: 'create_invite', description: t('telegram.commands.createInvite', DEFAULT_LOCALE) },
            { command: 'list_invites', description: t('telegram.commands.listInvites', DEFAULT_LOCALE) },
            { command: 'revoke_invite', description: t('telegram.commands.revokeInvite', DEFAULT_LOCALE) },
        ]);

        telegramBot.launch(() => {
            console.log('Telegram bot started');
        }).catch(error => {
            LogService.logError('Telegram bot error: ', error);
        });
    }

    private handleHelpCommand(ctx: TelegramCommandContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const isClubAdmin = this.isUserClubAdmin(user);

        const locale = ctx.locale;
        let text = `<b>${t('telegram.help.title', locale)}</b>\n` +
            `\n` +
            `<code>/help</code> — ${t('telegram.help.cmdHelp', locale)}\n`;

        if (isClubAdmin) {
            text += `\n` +
                `<b>${t('telegram.help.sectionAdmin', locale)}:</b>\n` +
                `<code>/post_app_link</code> — ${t('telegram.help.cmdPostAppLink', locale)}\n` +
                `\n` +
                `<b>${t('telegram.help.sectionPolls', locale)}:</b>\n` +
                `<code>/setup_poll</code> — ${t('telegram.help.cmdSetupPoll', locale)}\n` +
                `<code>/preview_poll</code> — ${t('telegram.help.cmdPreviewPoll', locale)}\n` +
                `<code>/send_poll</code> — ${t('telegram.help.cmdSendPoll', locale)}\n` +
                `\n` +
                `<b>${t('telegram.help.sectionInvites', locale)}:</b>\n` +
                `<code>/create_invite</code> — ${t('telegram.help.cmdCreateInvite', locale)}\n` +
                `<code>/list_invites</code> — ${t('telegram.help.cmdListInvites', locale)}\n` +
                `<code>/revoke_invite</code> — ${t('telegram.help.cmdRevokeInvite', locale)}\n` +
                `\n` +
                `<b>${t('telegram.help.sectionNotifications', locale)}:</b>\n` +
                `<code>/set_topic</code> — ${t('telegram.help.cmdSetTopic', locale)}\n` +
                `<code>/unset_topic</code> — ${t('telegram.help.cmdUnsetTopic', locale)}\n` +
                `<code>/diagnose_topics</code> — ${t('telegram.help.cmdDiagnoseTopics', locale)}\n`;
        }

        if (user.isAdmin) {
            text += `\n` +
                `<b>${t('telegram.help.sectionTournament', locale)}:</b>\n` +
                `<code>/import_tournament_round</code> — ${t('telegram.help.cmdImportTournamentRound', locale)}\n`;
        }

        ctx.replyWithHTML(text);
    }

    private handlePostAppLinkCommand(ctx: TelegramCommandContext) {
        ctx.replyWithHTML(
            `<b>${t('telegram.appLink.title', ctx.locale)}</b>\n` +
                t('telegram.appLink.body', ctx.locale),
            {
                reply_markup: {
                    inline_keyboard: [[{
                        text: t('telegram.appLink.openButton', ctx.locale),
                        url: config.botUrl,
                    }]],
                },
            }
        );
    }

    private handleSetTopicCommand(ctx: TelegramCommandContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubData = this.getUserOwnedClubData(user);
        const messageTopicId = this.getMessageTopicId(ctx.message);

        ctx.reply(t('telegram.topic.selectClubToSet', ctx.locale), {
            reply_markup: {
                inline_keyboard: clubData.map(membership => [{
                    text: membership.clubName,
                    callback_data: `select_topic_type_${membership.clubId}` +
                        (messageTopicId !== undefined ? `_${messageTopicId}` : ''),
                }]),
            },
        });
    }

    private async handleSelectTopicTypeCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const topicId = ctx.match[2] ? parseInt(ctx.match[2]) : undefined;

        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        ctx.reply(t('telegram.topic.selectTopicToSet', ctx.locale), {
            reply_markup: {
                inline_keyboard: Object.values(ClubTelegramTopicType).map(topicType => [{
                    text: clubTelegramTopicDescription(topicType, ctx.locale),
                    callback_data: `set_topic_${topicType}_${clubId}` + (topicId !== undefined ? `_${topicId}` : ''),
                }]),
            },
        });
    }

    private async handleSetTopicCallback(ctx: TelegramCallbackQueryContext) {
        const topicType = parseClubTelegramTopicType(ctx.match[1]!);
        const clubId = parseInt(ctx.match[2]!);
        const topicId = ctx.match[3] ? parseInt(ctx.match[3]) : undefined;

        if (ctx.chat === undefined) {
            throw new Error(
                `Chat is missing in the callback context when processing set logging topic command for club ${clubId}`
            );
        }
        const chatId = ctx.chat.id;

        dbManager.db.transaction(() => {
            const user = this.getUserByTelegramId(ctx.from.id);
            this.validateUserCanEditClub(user, clubId);

            const clubTelegramTopics = this.clubService.getClubTelegramTopics(clubId);
            const updatedTopics = updateClubTelegramTopic(clubTelegramTopics, topicType, chatId, topicId);
            this.clubService.setClubTelegramTopics(clubId, updatedTopics, user.id);
        })();

        ctx.reply(clubTelegramTopicUpdatedSuccessfullyText(topicType, ctx.locale));
    }

    private handleUnsetTopicCommand(ctx: TelegramCommandContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubData = this.getUserOwnedClubData(user);

        ctx.reply(t('telegram.topic.selectClubToUnset', ctx.locale), {
            reply_markup: {
                inline_keyboard: clubData.map(c => [{
                    text: c.clubName,
                    callback_data: `select_unset_topic_type_${c.clubId}`,
                }]),
            },
        });
    }

    private handleSelectUnsetTopicTypeCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        const topics = this.clubService.getClubTelegramTopics(clubId);
        // Only show topic types that are currently set, so admins can't "unset" something already null.
        const setTypes = (Object.values(ClubTelegramTopicType) as ClubTelegramTopicType[])
            .filter(t => getTopicByType(topics, t) !== null);

        if (setTypes.length === 0) {
            ctx.reply(t('telegram.topic.noTopicsConfigured', ctx.locale));
            return;
        }

        ctx.reply(t('telegram.topic.selectTopicToUnset', ctx.locale), {
            reply_markup: {
                inline_keyboard: setTypes.map(topicType => [{
                    text: clubTelegramTopicDescription(topicType, ctx.locale),
                    callback_data: `unset_topic_${topicType}_${clubId}`,
                }]),
            },
        });
    }

    private handleUnsetTopicCallback(ctx: TelegramCallbackQueryContext) {
        const topicType = parseClubTelegramTopicType(ctx.match[1]!);
        const clubId = parseInt(ctx.match[2]!);

        dbManager.db.transaction(() => {
            const user = this.getUserByTelegramId(ctx.from.id);
            this.validateUserCanEditClub(user, clubId);

            const topics = this.clubService.getClubTelegramTopics(clubId);
            const updated = unsetClubTelegramTopic(topics, topicType);
            this.clubService.setClubTelegramTopics(clubId, updated, user.id);
        })();

        ctx.reply(clubTelegramTopicUnsetSuccessfullyText(topicType, ctx.locale));
    }

    private handleDiagnoseTopicsCommand(ctx: TelegramCommandContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubData = this.getUserOwnedClubData(user);

        if (clubData.length === 1) {
            // Skip the club picker for single-club admins — render directly.
            return this.sendDiagnoseTopicsForClub(ctx, user, clubData[0]!.clubId);
        }

        ctx.reply(t('telegram.topic.diagnoseSelectClub', ctx.locale), {
            reply_markup: {
                inline_keyboard: clubData.map(c => [{
                    text: c.clubName,
                    callback_data: `diagnose_topics_club_${c.clubId}`,
                }]),
            },
        });
    }

    private handleDiagnoseTopicsClubCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const user = this.getUserByTelegramId(ctx.from.id);
        this.sendDiagnoseTopicsForClub(ctx, user, clubId);
    }

    private sendDiagnoseTopicsForClub(
        ctx: TelegramCommandContext | TelegramCallbackQueryContext,
        user: User,
        clubId: number
    ) {
        this.validateUserCanEditClub(user, clubId);
        const topics = this.clubService.getClubTelegramTopics(clubId);

        const locale = ctx.locale;
        const lines: string[] = [`${t('telegram.topic.diagnoseTitle', locale)}`, ''];
        const buttons: { text: string, callback_data: string }[][] = [];

        for (const topicType of Object.values(ClubTelegramTopicType) as ClubTelegramTopicType[]) {
            const topic = getTopicByType(topics, topicType);
            const label = clubTelegramTopicDescription(topicType, locale);
            if (topic === null) {
                lines.push(`${label}: ${t('telegram.topic.diagnoseNotConfigured', locale)}`);
            } else {
                const topicSuffix = topic.topicId !== undefined
                    ? `${t('telegram.topic.diagnoseThread', locale)} <code>${topic.topicId}</code>`
                    : t('telegram.topic.diagnoseGeneral', locale);
                lines.push(`${label}: chat <code>${topic.chatId}</code>${topicSuffix}`);
                buttons.push([{
                    text: `${t('telegram.topic.testButton', locale)} ${label}`,
                    callback_data: `test_topic_${topicType}_${clubId}`,
                }]);
            }
        }

        ctx.replyWithHTML(lines.join('\n'), {
            reply_markup: { inline_keyboard: buttons },
        });
    }

    private async handleTestTopicCallback(ctx: TelegramCallbackQueryContext) {
        const topicType = parseClubTelegramTopicType(ctx.match[1]!);
        const clubId = parseInt(ctx.match[2]!);

        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        const topic = getTopicByType(this.clubService.getClubTelegramTopics(clubId), topicType);
        if (topic === null) {
            await ctx.answerCbQuery(t('telegram.topic.testNotConfigured', ctx.locale), { show_alert: true });
            return;
        }

        await TelegramMessageService.sendMessage(
            `<b>${t('telegram.topic.testMessageTitle', ctx.locale)}</b>\n` +
                `${t('telegram.topic.testMessageTopic', ctx.locale)} ${
                    clubTelegramTopicDescription(topicType, ctx.locale)
                }\n` +
                t('telegram.topic.testMessageBody', ctx.locale),
            topic
        );
        await ctx.answerCbQuery(t('telegram.topic.testMessageSent', ctx.locale));
    }

    // ── Poll wizard handlers ──

    private handleSetPollCommand(ctx: TelegramCommandContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubData = this.getUserOwnedClubData(user);

        ctx.reply(t('telegram.poll.setupIntro', ctx.locale), {
            reply_markup: {
                inline_keyboard: clubData.map(club => [{
                    text: club.clubName,
                    callback_data: `poll_club_${club.clubId}`,
                }]),
            },
        });
    }

    private handlePollSelectClubCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        const existingConfig = this.pollRepository.findConfigByClubId(clubId);
        if (!existingConfig) {
            this.showDaySelector(ctx, clubId, '');
            return;
        }

        const locale = ctx.locale;
        const club = this.clubService.getClubById(clubId);
        const dayNames = dayNamesShort(locale);
        const daysText = existingConfig.eventDays.map(d => dayNames[d]).join(', ');
        const sendDayText = dayNames[existingConfig.sendDay];
        ctx.reply(
            `${t('telegram.poll.existingTitle', locale, { clubName: club.name })}\n\n` +
                `${t('telegram.poll.titleLabel', locale)} ${existingConfig.pollTitle}\n` +
                `${t('telegram.poll.eventDaysLabel', locale)} ${daysText}\n` +
                `${t('telegram.poll.sendLabel', locale)} ${sendDayText} ${
                    t('telegram.poll.sendAtConnector', locale)
                } ${existingConfig.sendTime}\n` +
                `${t('telegram.poll.extrasLabel', locale)} ${
                    existingConfig.extraOptions.length > 0
                        ? existingConfig.extraOptions.join(', ')
                        : t('telegram.poll.none', locale)
                }\n` +
                `${
                    existingConfig.isActive
                        ? t('telegram.poll.statusActive', locale)
                        : t('telegram.poll.statusInactive', locale)
                }`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{
                            text: t('telegram.poll.reconfigure', locale),
                            callback_data: `poll_day_${clubId}_-1_`,
                        }],
                        existingConfig.isActive
                            ? [{
                                text: t('telegram.poll.disable', locale),
                                callback_data: `poll_toggle_${clubId}`,
                            }]
                            : [{
                                text: t('telegram.poll.enable', locale),
                                callback_data: `poll_toggle_${clubId}`,
                            }],
                    ],
                },
            }
        );
    }

    private handlePollToggleDayCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const toggleDay = parseInt(ctx.match[2]!);
        let selectedDays = parseNumberList(ctx.match[3]!);

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
        const locale = ctx.locale;
        const selectedDays = parseNumberList(daysStr);
        const dayNames = dayNamesShort(locale);

        const dayButtons = ALL_DAYS.map(day => ({
            text: (selectedDays.includes(day) ? '✅ ' : '⬜ ') + dayNames[day],
            callback_data: `poll_day_${clubId}_${day}_${daysStr}`,
        }));

        const keyboard = [
            dayButtons.slice(0, 4),
            dayButtons.slice(4, 7),
            ...(selectedDays.length > 0
                ? [[{
                    text: t('telegram.poll.next', locale),
                    callback_data: `poll_days_done_${clubId}_${daysStr}`,
                }]]
                : []),
        ];

        ctx.reply(t('telegram.poll.selectEventDays', locale), {
            reply_markup: { inline_keyboard: keyboard },
        });
    }

    private handlePollDaysDoneCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const daysStr = ctx.match[2]!;

        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        const dayNames = dayNamesShort(ctx.locale);
        const dayButtons = ALL_DAYS.map(day => [{
            text: dayNames[day]!,
            callback_data: `poll_send_${clubId}_${daysStr}_${day}`,
        }]);

        ctx.reply(t('telegram.poll.selectSendDay', ctx.locale), {
            reply_markup: { inline_keyboard: dayButtons },
        });
    }

    private handlePollSendDayCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const daysStr = ctx.match[2]!;
        const sendDay = parseInt(ctx.match[3]!);

        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        const timeOptions = ['09:00', '10:00', '12:00', '14:00', '16:00', '18:00'];
        const timeButtons = timeOptions.map(time => [{
            text: time,
            callback_data: `poll_time_${clubId}_${daysStr}_${sendDay}_${time}`,
        }]);

        ctx.reply(t('telegram.poll.selectSendTime', ctx.locale), {
            reply_markup: { inline_keyboard: timeButtons },
        });
    }

    private handlePollTimeCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const daysStr = ctx.match[2]!;
        const sendDay = parseInt(ctx.match[3]!);
        const sendTime = ctx.match[4]!;

        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        // Only the "results" option is selected by default.
        this.showExtraOptionsSelector(ctx, clubId, daysStr, sendDay, sendTime, '0');
    }

    private handlePollToggleExtraCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const daysStr = ctx.match[2]!;
        const sendDay = parseInt(ctx.match[3]!);
        const sendTime = ctx.match[4]!;
        const toggleIndex = parseInt(ctx.match[5]!);
        let selectedExtras = parseNumberList(ctx.match[6]!);

        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        if (selectedExtras.includes(toggleIndex)) {
            selectedExtras = selectedExtras.filter(i => i !== toggleIndex);
        } else {
            selectedExtras.push(toggleIndex);
            selectedExtras.sort((a, b) => a - b);
        }

        this.showExtraOptionsSelector(ctx, clubId, daysStr, sendDay, sendTime, selectedExtras.join(','));
    }

    private showExtraOptionsSelector(
        ctx: TelegramCallbackQueryContext,
        clubId: number,
        daysStr: string,
        sendDay: number,
        sendTime: string,
        extrasStr: string
    ) {
        const selectedExtras = parseNumberList(extrasStr);

        // Preset labels map to the strings persisted into the poll config and shown to club
        // members, so they follow the club locale — not the admin's.
        const club = this.clubService.getClubById(clubId);
        const presets = extraOptionPresets(resolveClubLocale(club));
        const extraButtons = presets.map((option, index) => [{
            text: (selectedExtras.includes(index) ? '✅ ' : '⬜ ') + option,
            callback_data: `poll_extra_${clubId}_${daysStr}_${sendDay}_${sendTime}_${index}_${extrasStr}`,
        }]);

        ctx.reply(t('telegram.poll.selectExtraOptions', ctx.locale), {
            reply_markup: {
                inline_keyboard: [
                    ...extraButtons,
                    [{
                        text: t('telegram.poll.saveAndContinue', ctx.locale),
                        callback_data: `poll_extras_done_${clubId}_${daysStr}_${sendDay}_${sendTime}_${extrasStr}`,
                    }],
                ],
            },
        });
    }

    private handlePollExtrasDoneCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const daysStr = ctx.match[2]!;
        const sendDay = parseInt(ctx.match[3]!);
        const sendTime = ctx.match[4]!;
        const extrasStr = ctx.match[5]!;

        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        const locale = ctx.locale;
        const club = this.clubService.getClubById(clubId);
        const eventDays = daysStr.split(',').map(Number);
        // Stored options are club-facing (rendered into the poll shown to members), so map them
        // through the club locale rather than the admin's.
        const clubPresets = extraOptionPresets(resolveClubLocale(club));
        const extraOptions = parseNumberList(extrasStr).map(i => clubPresets[i]!);

        const pollConfig: ClubPollConfig = {
            clubId,
            pollTitle: club.name,
            eventDays,
            sendDay,
            sendTime,
            extraOptions,
            isActive: true,
        };

        this.pollRepository.upsertConfig(pollConfig, user.id);

        const dayNames = dayNamesShort(locale);
        const daysText = eventDays.map(d => dayNames[d]).join(', ');
        const extrasText = extraOptions.length > 0
            ? extraOptions.join(', ')
            : t('telegram.poll.none', locale);
        ctx.reply(
            `${t('telegram.poll.savedTitle', locale)}\n\n` +
                `${t('telegram.poll.titleLabel', locale)} ${club.name}\n` +
                `${t('telegram.poll.eventDaysLabel', locale)} ${daysText}\n` +
                `${t('telegram.poll.sendLabel', locale)} ${dayNames[sendDay]} ${
                    t('telegram.poll.sendAtConnector', locale)
                } ${sendTime}\n` +
                `${t('telegram.poll.extrasLabel', locale)} ${extrasText}\n\n` +
                t('telegram.poll.savedReminder', locale)
        );
    }

    private handlePollToggleCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        const existingConfig = this.pollRepository.findConfigByClubId(clubId);
        if (!existingConfig) return;

        const newConfig = { ...existingConfig, isActive: !existingConfig.isActive };
        this.pollRepository.upsertConfig(newConfig, user.id);

        ctx.reply(
            newConfig.isActive
                ? t('telegram.poll.enabledNotice', ctx.locale)
                : t('telegram.poll.disabledNotice', ctx.locale)
        );
    }

    // ── Preview & Send poll handlers ──

    private handlePreviewPollCommand(ctx: TelegramCommandContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubData = this.getUserOwnedClubData(user);

        const clubsWithPolls = clubData.filter(club =>
            this.pollRepository.findConfigByClubId(club.clubId) !== undefined
        );

        if (clubsWithPolls.length === 0) {
            ctx.reply(t('telegram.poll.noConfigsUseSetup', ctx.locale));
            return;
        }

        ctx.reply(t('telegram.poll.previewIntro', ctx.locale), {
            reply_markup: {
                inline_keyboard: clubsWithPolls.map(club => [{
                    text: `📊 ${club.clubName}`,
                    callback_data: `preview_poll_confirm_${club.clubId}`,
                }]),
            },
        });
    }

    private async handlePreviewPollConfirmCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        const pollConfig = this.pollRepository.findConfigByClubId(clubId);
        if (!pollConfig) {
            ctx.reply(t('telegram.poll.notConfiguredForClub', ctx.locale));
            return;
        }

        const clubLocale = resolveClubLocale(this.clubService.getClubById(clubId));
        const title = PollSchedulerService.buildPollTitle(pollConfig, clubLocale);
        const options = PollSchedulerService.buildPollOptions(pollConfig, clubLocale);
        await ctx.sendPoll(title, options, {
            is_anonymous: false,
            allows_multiple_answers: true,
        });
    }

    private handleSendPollCommand(ctx: TelegramCommandContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubData = this.getUserOwnedClubData(user);

        const clubsWithPolls = clubData.filter(club =>
            this.pollRepository.findConfigByClubId(club.clubId) !== undefined
        );

        if (clubsWithPolls.length === 0) {
            ctx.reply(t('telegram.poll.noConfigsUseSetup', ctx.locale));
            return;
        }

        ctx.reply(t('telegram.poll.sendNowConfirm', ctx.locale), {
            reply_markup: {
                inline_keyboard: clubsWithPolls.map(club => [{
                    text: `📊 ${club.clubName}`,
                    callback_data: `send_poll_confirm_${club.clubId}`,
                }]),
            },
        });
    }

    private async handleSendPollConfirmCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        const pollConfig = this.pollRepository.findConfigByClubId(clubId);
        if (!pollConfig) {
            ctx.reply(t('telegram.poll.notConfiguredForClub', ctx.locale));
            return;
        }

        const mainTopic = this.clubService.getClubTelegramTopics(clubId).main;
        if (mainTopic === null) {
            ctx.reply(t('telegram.poll.mainTopicNotSet', ctx.locale));
            return;
        }

        const result = await PollSchedulerService.sendPollNow(pollConfig);
        if (result.messageId === null) {
            ctx.reply(t('telegram.poll.sendFailed', ctx.locale));
            return;
        }

        ctx.reply(
            result.pinned
                ? t('telegram.poll.sentAndPinned', ctx.locale)
                : t('telegram.poll.sentNotPinned', ctx.locale)
        );
    }

    // ── Club invite handlers ──

    private handleCreateInviteCommand(ctx: TelegramCommandContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubData = this.getUserOwnedClubData(user);

        ctx.reply(t('telegram.invite.selectClubToCreate', ctx.locale), {
            reply_markup: {
                inline_keyboard: clubData.map(club => [{
                    text: club.clubName,
                    callback_data: `inv_c_${club.clubId}`,
                }]),
            },
        });
    }

    private handleCreateInviteClubCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        ctx.reply(t('telegram.invite.selectType', ctx.locale), {
            reply_markup: {
                inline_keyboard: [
                    [{
                        text: inviteTypeLabel(ClubInviteType.JOIN_CLUB, ctx.locale),
                        callback_data: `inv_t_${clubId}_J`,
                    }],
                    [{
                        text: inviteTypeLabel(ClubInviteType.REGISTRATION_ONLY, ctx.locale),
                        callback_data: `inv_t_${clubId}_R`,
                    }],
                ],
            },
        });
    }

    private handleCreateInviteTypeCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const typeCode = ctx.match[2]!;
        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        ctx.reply(t('telegram.invite.selectSource', ctx.locale), {
            reply_markup: {
                inline_keyboard: INVITE_SOURCES.map((source, index) => [{
                    text: inviteSourceLabel(source, ctx.locale),
                    callback_data: `inv_s_${clubId}_${typeCode}_${index}`,
                }]),
            },
        });
    }

    private async handleCreateInviteSourceCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const type = inviteTypeFromCode(ctx.match[2]!);
        const source = INVITE_SOURCES[parseInt(ctx.match[3]!)];
        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        if (source === undefined) {
            ctx.reply(t('telegram.invite.unknownSource', ctx.locale));
            return;
        }

        const invite = dbManager.db.transaction(() =>
            this.clubInviteService.createInvite({
                clubId,
                type,
                source,
                createdBy: user.id,
            })
        )();

        const link = inviteDeepLink(invite.code);
        const caption = dedent`
            <b>${t('telegram.invite.captionTitle', ctx.locale)}</b>

            <b>${t('telegram.invite.captionClub', ctx.locale)}</b> ${invite.clubName}
            <b>${t('telegram.invite.captionType', ctx.locale)}</b> ${inviteTypeLabel(invite.type, ctx.locale)}
            <b>${t('telegram.invite.captionSource', ctx.locale)}</b> ${inviteSourceLabel(invite.source, ctx.locale)}
            <b>${t('telegram.invite.captionCode', ctx.locale)}</b> <code>${invite.code}</code>

            <a href="${link}">${link}</a>
        `;

        const qr = await generateQrPng(link);
        await ctx.replyWithPhoto({ source: qr }, { caption, parse_mode: 'HTML' });
    }

    private handleListInvitesCommand(ctx: TelegramCommandContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubData = this.getUserOwnedClubData(user);

        ctx.reply(t('telegram.invite.selectClubToList', ctx.locale), {
            reply_markup: {
                inline_keyboard: clubData.map(club => [{
                    text: club.clubName,
                    callback_data: `invl_c_${club.clubId}`,
                }]),
            },
        });
    }

    private handleListInvitesClubCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        const invites = this.clubInviteService.listInvites(clubId);
        if (invites.length === 0) {
            ctx.reply(t('telegram.invite.noInvites', ctx.locale));
            return;
        }

        const text = invites.map(invite => formatInviteLine(invite, ctx.locale)).join('\n\n');
        ctx.replyWithHTML(`<b>${t('telegram.invite.listTitle', ctx.locale)}</b>\n\n${text}`);
    }

    private handleRevokeInviteCommand(ctx: TelegramCommandContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubData = this.getUserOwnedClubData(user);

        ctx.reply(t('telegram.invite.selectClubToRevoke', ctx.locale), {
            reply_markup: {
                inline_keyboard: clubData.map(club => [{
                    text: club.clubName,
                    callback_data: `invr_c_${club.clubId}`,
                }]),
            },
        });
    }

    private handleRevokeInviteClubCallback(ctx: TelegramCallbackQueryContext) {
        const clubId = parseInt(ctx.match[1]!);
        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserCanEditClub(user, clubId);

        const activeInvites = this.clubInviteService.listInvites(clubId).filter(invite => invite.isActive);
        if (activeInvites.length === 0) {
            throw new NoActiveInvitesTelegramError();
        }

        ctx.reply(t('telegram.invite.selectToRevoke', ctx.locale), {
            reply_markup: {
                inline_keyboard: activeInvites.map(invite => [{
                    text: `${invite.code} · ${inviteTypeLabel(invite.type, ctx.locale)}`,
                    callback_data: `invr_p_${invite.id}`,
                }]),
            },
        });
    }

    private handleRevokeInvitePickCallback(ctx: TelegramCallbackQueryContext) {
        const inviteId = parseInt(ctx.match[1]!);
        const user = this.getUserByTelegramId(ctx.from.id);
        const invite = this.clubInviteService.getInviteById(inviteId);
        this.validateUserCanEditClub(user, invite.clubId);

        ctx.reply(t('telegram.invite.revokeConfirmPrompt', ctx.locale, { code: invite.code }), {
            reply_markup: {
                inline_keyboard: [[{
                    text: t('telegram.invite.revokeButton', ctx.locale),
                    callback_data: `invr_x_${invite.id}`,
                }]],
            },
        });
    }

    private handleRevokeInviteConfirmCallback(ctx: TelegramCallbackQueryContext) {
        const inviteId = parseInt(ctx.match[1]!);
        const user = this.getUserByTelegramId(ctx.from.id);
        const invite = this.clubInviteService.getInviteById(inviteId);
        this.validateUserCanEditClub(user, invite.clubId);

        const revoked = dbManager.db.transaction(() => this.clubInviteService.revokeInvite(inviteId, user.id))();
        ctx.reply(t('telegram.invite.revoked', ctx.locale, { code: revoked.code }));
    }

    private handleImportTournamentRoundCommand(ctx: TelegramCommandContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserIsGlobalAdmin(user);

        this.clearTournamentImportPending(ctx.from.id);

        const tournaments = this.eventService.getActiveTournaments()
            .sort((a, b) => b.id - a.id);

        if (tournaments.length === 0) {
            ctx.reply(t('telegram.tournamentImport.noActiveTournaments', ctx.locale));
            return;
        }

        ctx.reply(t('telegram.tournamentImport.selectTournament', ctx.locale), {
            reply_markup: {
                inline_keyboard: tournaments.map(event => [{
                    text: event.name,
                    callback_data: `import_round_event_${event.id}`,
                }]),
            },
        });
    }

    private handleImportRoundEventCallback(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserIsGlobalAdmin(user);

        const eventId = parseInt(ctx.match[1]!);
        const event = this.eventService.getEventById(eventId);
        if (event.type !== 'TOURNAMENT') {
            ctx.reply(t('telegram.tournamentImport.notTournament', ctx.locale));
            return;
        }
        if (this.eventService.hasEventEnded(event)) {
            ctx.reply(t('telegram.tournamentImport.tournamentEnded', ctx.locale));
            return;
        }

        this.setTournamentImportPending(ctx.from.id, {
            eventId,
            step: 'awaiting_round',
            updatedAt: Date.now(),
        });

        ctx.reply(t('telegram.tournamentImport.sendRoundNumber', ctx.locale));
    }

    private handleTextMessage(ctx: TelegramCommandContext) {
        const text = ctx.message.text;
        if (text.startsWith('/')) {
            return;
        }

        const pending = this.getTournamentImportPending(ctx.from.id);
        if (pending === undefined) {
            return;
        }

        const user = this.getUserByTelegramId(ctx.from.id);
        this.validateUserIsGlobalAdmin(user);

        this.handleTournamentImportText(ctx, pending, text, user.id);
    }

    private handleTournamentImportText(
        ctx: TelegramCommandContext,
        pending: TournamentImportPending,
        text: string,
        appUserId: number
    ) {
        if (pending.step === 'awaiting_round') {
            const round = Number(text.trim());
            if (!Number.isInteger(round) || round < 1) {
                ctx.reply(t('telegram.tournamentImport.roundMustBePositive', ctx.locale));
                return;
            }

            this.setTournamentImportPending(ctx.from.id, {
                eventId: pending.eventId,
                step: 'awaiting_data',
                round,
                updatedAt: Date.now(),
            });

            ctx.reply(t('telegram.tournamentImport.sendSeating', ctx.locale, { round }));
            return;
        }

        if (pending.step === 'awaiting_data' && pending.round !== undefined) {
            const result = this.tournamentRoundImportService.parseAndImport(
                pending.eventId,
                pending.round,
                text,
                appUserId
            );

            this.clearTournamentImportPending(ctx.from.id);

            if (result.errors.length > 0) {
                ctx.reply(
                    `${t('telegram.tournamentImport.importErrorsTitle', ctx.locale)}\n` +
                        result.errors.map(e => `• ${e}`).join('\n')
                );
                return;
            }

            ctx.reply(t('telegram.tournamentImport.imported', ctx.locale, { count: result.imported }));
        }
    }

    private getTournamentImportPending(telegramId: number): TournamentImportPending | undefined {
        const pending = this.tournamentImportPending.get(telegramId);
        if (pending === undefined) {
            return undefined;
        }
        if (Date.now() - pending.updatedAt > PENDING_TTL_MS) {
            this.tournamentImportPending.delete(telegramId);
            return undefined;
        }
        return pending;
    }

    private setTournamentImportPending(telegramId: number, pending: TournamentImportPending): void {
        this.tournamentImportPending.set(telegramId, pending);
    }

    private clearTournamentImportPending(telegramId: number): void {
        this.tournamentImportPending.delete(telegramId);
    }

    private validateUserIsGlobalAdmin(user: User): void {
        if (!user.isAdmin) {
            throw new UserNotAdminTelegramError();
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

    private isUserClubAdmin(user: User): boolean {
        if (user.isAdmin) return true;
        return this.clubMembershipService.getUserClubMemberships(user.id)
            .some(membership => membership.permissions.canEditClub);
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
        ctx: TelegramCallbackQueryRawContext,
        code: (ctx: TelegramCallbackQueryContext) => Promise<void> | void
    ) {
        await this.executeWithErrorHandling(ctx, async ctx => {
            try {
                await code(ctx);
            } finally {
                // delete message with inline keyboard after selection
                try {
                    await ctx.deleteMessage();
                } catch (error) {
                    LogService.logError(
                        `Error deleting Telegram message in chat ${ctx.chat?.id} while processing callback query from user ${ctx.from.id}: `,
                        error
                    );
                }
            }
        });
    }

    private async executeWithErrorHandling<C extends Context<U>, U extends Update>(
        ctx: C,
        code: (ctx: C & { locale: SupportedLocale }) => Promise<void> | void
    ) {
        if (ctx.from === undefined) {
            LogService.logError('Received telegram command with unknown sender: ' + ctx);
            return;
        }

        const user = this.userService.getOptionalUserByTelegramId(ctx.from.id);
        if (user === undefined) {
            LogService.logError(`Received telegram command from unregistered user with id: ${ctx.from.id}: ${ctx}`);
            ctx.reply(t('telegram.errors.userNotRegistered', DEFAULT_LOCALE));
            return;
        }
        const locale = resolveUserLocale(user);

        try {
            // Object.assign (not spread) so ctx's prototype methods (reply, etc.) survive
            await code(Object.assign(ctx, { locale }));
        } catch (e) {
            if (e instanceof TelegramReplyError) {
                ctx.reply(t(e.key, locale, e.params));
            } else {
                LogService.logError('Unexpected error executing Telegram command: ', e);
                ctx.reply(t('telegram.genericCommandError', locale));
            }
        }
    }

    private getMessageTopicId(message: Message.TextMessage): number | undefined {
        return message.is_topic_message ? message.message_thread_id : undefined;
    }
}

function parseNumberList(str: string): number[] {
    return str === '' ? [] : str.split(',').map(Number);
}

const INVITE_SOURCES: ClubInviteSource[] = Object.values(ClubInviteSource);

function inviteTypeLabel(type: ClubInviteType, locale: SupportedLocale): string {
    switch (type) {
        case ClubInviteType.JOIN_CLUB:
            return t('telegram.invite.typeJoinClub', locale);
        case ClubInviteType.REGISTRATION_ONLY:
            return t('telegram.invite.typeRegistrationOnly', locale);
    }
}

function inviteSourceLabel(source: ClubInviteSource, locale: SupportedLocale): string {
    switch (source) {
        case ClubInviteSource.PERSON:
            return t('telegram.invite.sourcePerson', locale);
        case ClubInviteSource.TUTORIAL:
            return t('telegram.invite.sourceTutorial', locale);
        case ClubInviteSource.FESTIVAL:
            return t('telegram.invite.sourceFestival', locale);
        case ClubInviteSource.SOCIAL_NETWORK:
            return t('telegram.invite.sourceSocialNetwork', locale);
        case ClubInviteSource.OTHER:
            return t('telegram.invite.sourceOther', locale);
    }
}

function inviteTypeFromCode(code: string): ClubInviteType {
    return code === 'J' ? ClubInviteType.JOIN_CLUB : ClubInviteType.REGISTRATION_ONLY;
}

function inviteDeepLink(code: string): string {
    return `${config.botUrl}?startapp=invite_${code}`;
}

function formatInviteLine(invite: ClubInvite, locale: SupportedLocale): string {
    const status = invite.isActive ? '🟢' : '🔴';
    const uses = invite.maxUses !== null ? `${invite.usesCount}/${invite.maxUses}` : `${invite.usesCount}`;
    const parts = [
        `${status} <code>${invite.code}</code> — ${inviteTypeLabel(invite.type, locale)}`,
        `${t('telegram.invite.lineSource', locale)} ${inviteSourceLabel(invite.source, locale)} · ` +
        `${t('telegram.invite.lineUses', locale)} ${uses}`,
    ];
    if (invite.label !== null) {
        parts.push(`${t('telegram.invite.lineLabel', locale)} ${invite.label}`);
    }
    if (invite.expiresAt !== null) {
        parts.push(`${t('telegram.invite.lineExpires', locale)} ${invite.expiresAt.toISOString()}`);
    }
    return parts.join('\n');
}

function clubTelegramTopicDescription(topicType: ClubTelegramTopicType, locale: SupportedLocale): string {
    switch (topicType) {
        case ClubTelegramTopicType.RATING:
            return t('telegram.topicType.rating', locale);
        case ClubTelegramTopicType.USER_LOGS:
            return t('telegram.topicType.userLogs', locale);
        case ClubTelegramTopicType.GAME_LOGS:
            return t('telegram.topicType.gameLogs', locale);
        case ClubTelegramTopicType.CLUB_LOGS:
            return t('telegram.topicType.clubLogs', locale);
        case ClubTelegramTopicType.MAIN:
            return t('telegram.topicType.main', locale);
    }
}

function clubTelegramTopicUpdatedSuccessfullyText(topicType: ClubTelegramTopicType, locale: SupportedLocale): string {
    switch (topicType) {
        case ClubTelegramTopicType.RATING:
            return t('telegram.topicSet.rating', locale);
        case ClubTelegramTopicType.USER_LOGS:
            return t('telegram.topicSet.userLogs', locale);
        case ClubTelegramTopicType.GAME_LOGS:
            return t('telegram.topicSet.gameLogs', locale);
        case ClubTelegramTopicType.CLUB_LOGS:
            return t('telegram.topicSet.clubLogs', locale);
        case ClubTelegramTopicType.MAIN:
            return t('telegram.topicSet.main', locale);
    }
}

function clubTelegramTopicUnsetSuccessfullyText(topicType: ClubTelegramTopicType, locale: SupportedLocale): string {
    switch (topicType) {
        case ClubTelegramTopicType.RATING:
            return t('telegram.topicUnset.rating', locale);
        case ClubTelegramTopicType.USER_LOGS:
            return t('telegram.topicUnset.userLogs', locale);
        case ClubTelegramTopicType.GAME_LOGS:
            return t('telegram.topicUnset.gameLogs', locale);
        case ClubTelegramTopicType.CLUB_LOGS:
            return t('telegram.topicUnset.clubLogs', locale);
        case ClubTelegramTopicType.MAIN:
            return t('telegram.topicUnset.main', locale);
    }
}

function getTopicByType(topics: ClubTelegramTopics, topicType: ClubTelegramTopicType): TelegramTopic | null {
    switch (topicType) {
        case ClubTelegramTopicType.RATING:
            return topics.rating;
        case ClubTelegramTopicType.USER_LOGS:
            return topics.userLogs;
        case ClubTelegramTopicType.GAME_LOGS:
            return topics.gameLogs;
        case ClubTelegramTopicType.CLUB_LOGS:
            return topics.clubLogs;
        case ClubTelegramTopicType.MAIN:
            return topics.main;
    }
}

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7]; // Mon-Sun

function dayNamesShort(locale: SupportedLocale): Record<number, string> {
    return {
        1: t('telegram.daysShort.mon', locale),
        2: t('telegram.daysShort.tue', locale),
        3: t('telegram.daysShort.wed', locale),
        4: t('telegram.daysShort.thu', locale),
        5: t('telegram.daysShort.fri', locale),
        6: t('telegram.daysShort.sat', locale),
        7: t('telegram.daysShort.sun', locale),
    };
}

function extraOptionPresets(locale: SupportedLocale): string[] {
    return [
        t('telegram.poll.extraResults', locale),
        t('telegram.poll.extraPass', locale),
        t('telegram.poll.extraMaybe', locale),
        t('telegram.poll.extraLate', locale),
    ];
}

export default new TelegramCommandService();
