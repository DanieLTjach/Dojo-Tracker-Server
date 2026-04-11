import { Context } from "telegraf";
import type { Message, Update } from "telegraf/types";
import { UserNotClubOwnerTelegramError, UserNotRegisteredTelegramError } from "../error/TelegramErrors.ts";
import { ClubMembershipService } from "./ClubMembershipService.ts";
import { ClubService } from "./ClubService.ts";
import { GameRulesService } from "./GameRulesService.ts";
import { UserService } from "./UserService.ts";
import LogService from "./LogService.ts";
import type { TelegramCommandContext, TelegramCallbackQueryContext, ClubData } from "../model/TelegramTypes.ts";
import type { GameRulesDetails } from "../model/EventModels.ts";
import { gameRulesDetailsSchema } from "../schema/GameRulesSchemas.ts";
import type { User } from "../model/UserModels.ts";
import { ClubRole } from "../model/ClubModels.ts";

interface PendingUpload {
    gameRulesId: number;
    gameRulesName: string;
    clubId: number | null;
    parsedDetails?: GameRulesDetails;
    timestamp: number;
}

const PENDING_UPLOAD_TTL_MS = 5 * 60 * 1000; // 5 minutes

const BASE_TEMPLATE: GameRulesDetails = {
    links: [
        { url: "https://example.com", label: "Повні правила (необов'язково)" }
    ],
    rules: [
        { rule: "Кількість гравців", value: "4" },
        { rule: "Стартові очки", value: "25,000" },
        { rule: "Ума", value: "15 / 5 / -5 / -15", tooltip: { label: "Ума", content: "Розподіл бонусних очок за місце:\n1-й: +15\n2-й: +5\n3-й: -5\n4-й: -15" } }
    ]
};

class TelegramGameRulesService {
    private userService = new UserService();
    private clubService = new ClubService();
    private clubMembershipService = new ClubMembershipService();
    private gameRulesService = new GameRulesService();
    private pendingUploads = new Map<number, PendingUpload>();

    // ── Entry Point ──

    handleGameRulesCommand(ctx: TelegramCommandContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        this.ensureIsClubOwnerOrAdmin(user);

        ctx.replyWithHTML(
            '📋 <b>Керування правилами гри</b>\nОберіть дію:',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📥 Завантажити правила', callback_data: 'gr_menu_dl' }],
                        [{ text: '📤 Додати нові правила', callback_data: 'gr_menu_upload' }],
                        [{ text: '✏️ Оновити правила', callback_data: 'gr_menu_update' }],
                        [{ text: '🗑 Видалити правила', callback_data: 'gr_menu_delete' }],
                    ]
                }
            }
        );
    }

    // ── Flow B: Download ──

    handleDownloadMenu(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        this.ensureIsClubOwnerOrAdmin(user);

        ctx.reply('Оберіть категорію:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🏠 Мої клуби', callback_data: 'gr_dl_cat_my' }],
                    [{ text: '🌐 Глобальні правила', callback_data: 'gr_dl_cat_global' }],
                    [{ text: '🏘 Інші клуби', callback_data: 'gr_dl_cat_other' }],
                    [{ text: '📄 Базовий шаблон', callback_data: 'gr_dl_template' }],
                ]
            }
        });
    }

    handleDownloadCategoryMy(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubs = this.getUserOwnedClubData(user);

        if (clubs.length === 0) {
            ctx.reply('У вас немає клубів.');
            return;
        }

        ctx.reply('Оберіть клуб:', {
            reply_markup: {
                inline_keyboard: clubs.map(club => ([{
                    text: club.clubName,
                    callback_data: `gr_dl_club_${club.clubId}`
                }]))
            }
        });
    }

    handleDownloadCategoryGlobal(ctx: TelegramCallbackQueryContext) {
        this.getUserByTelegramId(ctx.from.id);

        const rules = this.gameRulesService.getGlobalGameRules()
            .filter(r => r.details !== null);

        if (rules.length === 0) {
            ctx.reply('Глобальних правил з деталями не знайдено.');
            return;
        }

        ctx.reply('Оберіть правила:', {
            reply_markup: {
                inline_keyboard: rules.map(r => ([{
                    text: r.name,
                    callback_data: `gr_dl_${r.id}`
                }]))
            }
        });
    }

    handleDownloadCategoryOther(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const ownClubIds = new Set(this.getUserOwnedClubData(user).map(c => c.clubId));
        const allClubs = this.clubService.getAllActiveClubs()
            .filter(club => !ownClubIds.has(club.id));

        if (allClubs.length === 0) {
            ctx.reply('Інших клубів не знайдено.');
            return;
        }

        ctx.reply('Оберіть клуб:', {
            reply_markup: {
                inline_keyboard: allClubs.map(club => ([{
                    text: club.name,
                    callback_data: `gr_dl_club_${club.id}`
                }]))
            }
        });
    }

    async handleDownloadTemplate(ctx: TelegramCallbackQueryContext) {
        this.getUserByTelegramId(ctx.from.id);

        const buffer = Buffer.from(JSON.stringify(BASE_TEMPLATE, null, 2), 'utf-8');
        await ctx.replyWithDocument({
            source: buffer,
            filename: 'game-rules-template.json'
        });
    }

    handleDownloadClub(ctx: TelegramCallbackQueryContext) {
        this.getUserByTelegramId(ctx.from.id);

        const clubId = parseInt(ctx.match[1]!);
        const rules = this.gameRulesService.getGameRulesWithDetailsByClubId(clubId);

        if (rules.length === 0) {
            ctx.reply('Правил з деталями для цього клубу не знайдено.');
            return;
        }

        ctx.reply('Оберіть правила:', {
            reply_markup: {
                inline_keyboard: rules.map(r => ([{
                    text: r.name,
                    callback_data: `gr_dl_${r.id}`
                }]))
            }
        });
    }

    async handleDownloadRules(ctx: TelegramCallbackQueryContext) {
        this.getUserByTelegramId(ctx.from.id);

        const rulesId = parseInt(ctx.match[1]!);
        const rules = this.gameRulesService.getGameRulesById(rulesId);

        if (rules.details === null) {
            ctx.reply('Деталі не знайдено.');
            return;
        }

        const buffer = Buffer.from(JSON.stringify(rules.details, null, 2), 'utf-8');
        await ctx.replyWithDocument({
            source: buffer,
            filename: `${rules.name}.json`
        });
    }

    // ── Flow C: Upload New Details ──

    handleUploadMenu(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubs = this.getUserOwnedClubData(user);

        ctx.reply('Оберіть клуб:', {
            reply_markup: {
                inline_keyboard: clubs.map(club => ([{
                    text: club.clubName,
                    callback_data: `gr_up_club_${club.clubId}`
                }]))
            }
        });
    }

    handleUploadClub(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubId = parseInt(ctx.match[1]!);
        this.validateUserCanEditClub(user, clubId);

        const rules = this.gameRulesService.getGameRulesWithoutDetailsByClubId(clubId);

        if (rules.length === 0) {
            ctx.reply('Всі правила цього клубу вже мають деталі.');
            return;
        }

        ctx.reply('Оберіть правила для завантаження деталей:', {
            reply_markup: {
                inline_keyboard: rules.map(r => ([{
                    text: r.name,
                    callback_data: `gr_up_${r.id}`
                }]))
            }
        });
    }

    handleUploadRules(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const rulesId = parseInt(ctx.match[1]!);
        const rules = this.gameRulesService.getGameRulesById(rulesId);

        if (rules.clubId !== null) {
            this.validateUserCanEditClub(user, rules.clubId);
        }

        this.pendingUploads.set(ctx.from.id, {
            gameRulesId: rulesId,
            gameRulesName: rules.name,
            clubId: rules.clubId,
            timestamp: Date.now()
        });

        ctx.reply(`Надішліть .json файл з деталями правил для "${rules.name}". У вас є 5 хвилин.`);
    }

    // ── Flow D: Update Existing Details ──

    handleUpdateMenu(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubs = this.getUserOwnedClubData(user);

        ctx.reply('Оберіть клуб:', {
            reply_markup: {
                inline_keyboard: clubs.map(club => ([{
                    text: club.clubName,
                    callback_data: `gr_upd_club_${club.clubId}`
                }]))
            }
        });
    }

    handleUpdateClub(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubId = parseInt(ctx.match[1]!);
        this.validateUserCanEditClub(user, clubId);

        const rules = this.gameRulesService.getGameRulesWithDetailsByClubId(clubId);

        if (rules.length === 0) {
            ctx.reply('Правил з деталями для цього клубу не знайдено.');
            return;
        }

        ctx.reply('Оберіть правила для оновлення:', {
            reply_markup: {
                inline_keyboard: rules.map(r => ([{
                    text: r.name,
                    callback_data: `gr_upd_${r.id}`
                }]))
            }
        });
    }

    handleUpdateRules(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const rulesId = parseInt(ctx.match[1]!);
        const rules = this.gameRulesService.getGameRulesById(rulesId);

        if (rules.clubId !== null) {
            this.validateUserCanEditClub(user, rules.clubId);
        }

        this.pendingUploads.set(ctx.from.id, {
            gameRulesId: rulesId,
            gameRulesName: rules.name,
            clubId: rules.clubId,
            timestamp: Date.now()
        });

        ctx.reply(`Надішліть .json файл з оновленими деталями для "${rules.name}". У вас є 5 хвилин.`);
    }

    // ── Flow E: Document Upload Handler ──

    async handleDocumentUpload(ctx: Context<{ message: Update.New & Update.NonChannel & Message.DocumentMessage; update_id: number }>) {
        const userId = ctx.from.id;
        const pending = this.pendingUploads.get(userId);

        if (!pending) return;

        // Check TTL
        if (Date.now() - pending.timestamp > PENDING_UPLOAD_TTL_MS) {
            this.pendingUploads.delete(userId);
            ctx.reply('Час вичерпано, спробуйте ще раз.');
            return;
        }

        const document = ctx.message.document;

        // Validate file is .json
        if (!document.file_name?.endsWith('.json')) {
            this.pendingUploads.delete(userId);
            ctx.reply('Файл повинен мати розширення .json');
            return;
        }

        try {
            // Download file
            const fileLink = await ctx.telegram.getFileLink(document.file_id);
            const response = await fetch(fileLink.toString());
            const text = await response.text();

            // Parse JSON
            let parsed: unknown;
            try {
                parsed = JSON.parse(text);
            } catch {
                this.pendingUploads.delete(userId);
                ctx.reply('Невалідний JSON файл.');
                return;
            }

            // Validate with Zod
            const result = gameRulesDetailsSchema.safeParse(parsed);
            if (!result.success) {
                this.pendingUploads.delete(userId);
                const errors = result.error.issues.map(i => `• ${i.path.join('.')}: ${i.message}`).join('\n');
                ctx.replyWithHTML(`❌ <b>Помилки валідації:</b>\n${errors}`);
                return;
            }

            const newDetails = result.data as GameRulesDetails;

            // For updates: send old version as backup
            const existingRules = this.gameRulesService.getGameRulesById(pending.gameRulesId);
            if (existingRules.details !== null) {
                const oldBuffer = Buffer.from(JSON.stringify(existingRules.details, null, 2), 'utf-8');
                await ctx.replyWithDocument(
                    { source: oldBuffer, filename: `${pending.gameRulesName}-old.json` },
                    { caption: '📎 Попередня версія (бекап)' }
                );
            }

            // Build diff summary
            const summary = buildDiffSummary(existingRules.details, newDetails);

            // Store parsed details
            pending.parsedDetails = newDetails;

            ctx.replyWithHTML(
                `📋 <b>Зміни для "${pending.gameRulesName}":</b>\n${summary}`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Зберегти', callback_data: `gr_confirm_${pending.gameRulesId}` },
                                { text: '❌ Скасувати', callback_data: 'gr_cancel' }
                            ]
                        ]
                    }
                }
            );
        } catch (error) {
            this.pendingUploads.delete(userId);
            LogService.logError('Error processing game rules document upload: ', error);
            ctx.reply('Помилка при обробці файлу. Спробуйте ще раз.');
        }
    }

    // ── Flow F: Confirm / Cancel ──

    handleConfirm(ctx: TelegramCallbackQueryContext) {
        const userId = ctx.from.id;
        const pending = this.pendingUploads.get(userId);

        if (!pending || !pending.parsedDetails) {
            ctx.reply('Немає даних для збереження. Спробуйте ще раз.');
            return;
        }

        const user = this.getUserByTelegramId(userId);
        this.gameRulesService.updateGameRulesDetails(pending.gameRulesId, pending.parsedDetails, user.id);
        this.pendingUploads.delete(userId);

        ctx.reply('✅ Деталі збережено!');
    }

    handleCancel(ctx: TelegramCallbackQueryContext) {
        this.pendingUploads.delete(ctx.from.id);
        ctx.reply('❌ Скасовано');
    }

    // ── Flow G: Delete Details ──

    handleDeleteMenu(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubs = this.getUserOwnedClubData(user);

        ctx.reply('Оберіть клуб:', {
            reply_markup: {
                inline_keyboard: clubs.map(club => ([{
                    text: club.clubName,
                    callback_data: `gr_del_club_${club.clubId}`
                }]))
            }
        });
    }

    handleDeleteClub(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubId = parseInt(ctx.match[1]!);
        this.validateUserCanEditClub(user, clubId);

        const rules = this.gameRulesService.getGameRulesWithDetailsByClubId(clubId);

        if (rules.length === 0) {
            ctx.reply('Правил з деталями для цього клубу не знайдено.');
            return;
        }

        ctx.reply('Оберіть правила для видалення деталей:', {
            reply_markup: {
                inline_keyboard: rules.map(r => ([{
                    text: r.name,
                    callback_data: `gr_del_${r.id}`
                }]))
            }
        });
    }

    handleDeleteRules(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const rulesId = parseInt(ctx.match[1]!);
        const rules = this.gameRulesService.getGameRulesById(rulesId);

        if (rules.clubId !== null) {
            this.validateUserCanEditClub(user, rules.clubId);
        }

        ctx.replyWithHTML(
            `Видалити деталі для "<b>${rules.name}</b>"?`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '✅ Так', callback_data: `gr_del_confirm_${rulesId}` },
                            { text: '❌ Ні', callback_data: 'gr_cancel' }
                        ]
                    ]
                }
            }
        );
    }

    async handleDeleteConfirm(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const rulesId = parseInt(ctx.match[1]!);
        const rules = this.gameRulesService.getGameRulesById(rulesId);

        if (rules.clubId !== null) {
            this.validateUserCanEditClub(user, rules.clubId);
        }

        // Send old details as backup before deleting
        if (rules.details !== null) {
            const oldBuffer = Buffer.from(JSON.stringify(rules.details, null, 2), 'utf-8');
            await ctx.replyWithDocument(
                { source: oldBuffer, filename: `${rules.name}-deleted.json` },
                { caption: '📎 Видалена версія (бекап)' }
            );
        }

        this.gameRulesService.updateGameRulesDetails(rulesId, null, user.id);
        ctx.reply('✅ Деталі видалено');
    }

    // ── Auth helpers ──

    private getUserByTelegramId(userTelegramId: number): User {
        const user = this.userService.getOptionalUserByTelegramId(userTelegramId);
        if (user === undefined || !user.isActive) {
            throw new UserNotRegisteredTelegramError();
        }
        return user;
    }

    private validateUserCanEditClub(user: User, clubId: number) {
        if (user.isAdmin) return;

        const role = this.clubMembershipService.getUserClubRole(clubId, user.id);
        if (role !== ClubRole.OWNER) {
            throw new UserNotClubOwnerTelegramError();
        }
    }

    private ensureIsClubOwnerOrAdmin(user: User) {
        if (user.isAdmin) return;

        const memberships = this.clubMembershipService.getUserClubMemberships(user.id);
        const isOwner = memberships.some(m => m.role === ClubRole.OWNER);
        if (!isOwner) {
            throw new UserNotClubOwnerTelegramError();
        }
    }

    private getUserOwnedClubData(user: User): ClubData[] {
        if (user.isAdmin) {
            return this.clubService.getAllActiveClubs()
                .map(club => ({ clubId: club.id, clubName: club.name }));
        }

        const clubData = this.clubMembershipService.getUserClubMemberships(user.id)
            .filter(m => m.role === ClubRole.OWNER)
            .map(m => ({ clubId: m.clubId, clubName: m.clubName }));

        if (clubData.length === 0) {
            throw new UserNotClubOwnerTelegramError();
        }

        return clubData;
    }

    hasPendingUpload(userId: number): boolean {
        return this.pendingUploads.has(userId);
    }
}

// ── Diff Summary ──

function buildDiffSummary(oldDetails: GameRulesDetails | null, newDetails: GameRulesDetails): string {
    if (oldDetails === null) {
        const lines: string[] = [];
        lines.push(`• Правил: ${newDetails.rules.length}`);
        if (newDetails.links?.length) lines.push(`• Посилань: ${newDetails.links.length}`);
        const tooltipCount = newDetails.rules.filter(r => r.tooltip).length;
        if (tooltipCount > 0) lines.push(`• Підказок: ${tooltipCount}`);
        return lines.join('\n');
    }

    const lines: string[] = [];

    // Links
    const oldLinkCount = oldDetails.links?.length ?? 0;
    const newLinkCount = newDetails.links?.length ?? 0;
    if (oldLinkCount !== newLinkCount) {
        lines.push(`• Посилань: ${oldLinkCount} → ${newLinkCount}`);
    } else if (JSON.stringify(oldDetails.links) !== JSON.stringify(newDetails.links)) {
        lines.push(`• Посилання: змінено`);
    }

    // Rules
    const oldRuleCount = oldDetails.rules.length;
    const newRuleCount = newDetails.rules.length;
    if (oldRuleCount !== newRuleCount) {
        lines.push(`• Правил: ${oldRuleCount} → ${newRuleCount}`);
    } else {
        const modifiedRules = oldDetails.rules.filter((r, i) =>
            JSON.stringify(r) !== JSON.stringify(newDetails.rules[i])
        ).length;
        if (modifiedRules > 0) {
            lines.push(`• Змінено правил: ${modifiedRules}`);
        }
    }

    // Tooltips
    const oldTooltipCount = oldDetails.rules.filter(r => r.tooltip).length;
    const newTooltipCount = newDetails.rules.filter(r => r.tooltip).length;
    if (oldTooltipCount !== newTooltipCount) {
        lines.push(`• Підказок: ${oldTooltipCount} → ${newTooltipCount}`);
    }

    if (lines.length === 0) {
        lines.push('• Змін не виявлено');
    }

    return lines.join('\n');
}

export default new TelegramGameRulesService();
