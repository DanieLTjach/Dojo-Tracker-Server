import { Context } from "telegraf";
import type { Message, Update } from "telegraf/types";
import { TelegramPendingCreationMissingError, UserNotClubOwnerTelegramError, UserNotRegisteredTelegramError } from "../error/TelegramErrors.ts";
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

type CreationStep = 'name' | 'players' | 'points' | 'uma' | 'tiebreak' | 'chombo' | 'confirm';

interface PendingCreation {
    clubId: number;
    step: CreationStep;
    name?: string;
    numberOfPlayers?: number;
    startingPoints?: number;
    uma?: string;
    umaLabel?: string;
    umaTieBreak?: string;
    chomboPointsAfterUma?: number | null;
    timestamp: number;
}

const PENDING_UPLOAD_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PENDING_CREATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface UmaPreset {
    label: string;
    value: string;
}

const UMA_PRESETS_4P: UmaPreset[] = [
    { label: '15 / 5 / -5 / -15', value: '15,5,-5,-15' },
    { label: 'Плаваюча', value: '24,-2,-6,-16;16,8,-8,-16;16,6,2,-24' }
];

const UMA_PRESETS_3P: UmaPreset[] = [
    { label: '15 / 0 / -15', value: '15,0,-15' }
];

function umaPresetsFor(numberOfPlayers: number): UmaPreset[] {
    return numberOfPlayers === 3 ? UMA_PRESETS_3P : UMA_PRESETS_4P;
}

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
    private pendingCreations = new Map<number, PendingCreation>();

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

    // ── Flow C: Create Game Rules Wizard ──

    handleCreateMenu(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubs = this.getUserOwnedClubData(user);

        ctx.reply('Оберіть клуб для нових правил:', {
            reply_markup: {
                inline_keyboard: clubs.map(club => ([{
                    text: club.clubName,
                    callback_data: `gr_create_club_${club.clubId}`
                }]))
            }
        });
    }

    handleCreateClub(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubId = parseInt(ctx.match[1]!);
        this.validateUserCanEditClub(user, clubId);

        this.pendingCreations.set(ctx.from.id, {
            clubId,
            step: 'name',
            timestamp: Date.now()
        });

        ctx.reply('Введіть назву правил гри:');
    }

    handleCreateNameInput(ctx: Context<{ message: Update.New & Update.NonChannel & Message.TextMessage; update_id: number }>): boolean {
        const pending = this.getActivePendingCreation(ctx.from.id);
        if (!pending || pending.step !== 'name') return false;

        const name = ctx.message.text.trim();
        if (name.length === 0) {
            ctx.reply('Назва не може бути порожньою. Введіть назву:');
            return true;
        }

        pending.name = name;
        pending.step = 'players';
        pending.timestamp = Date.now();

        ctx.reply('Кількість гравців:', {
            reply_markup: {
                inline_keyboard: [[
                    { text: '3 гравці', callback_data: 'gr_create_players_3' },
                    { text: '4 гравці', callback_data: 'gr_create_players_4' }
                ]]
            }
        });
        return true;
    }

    handleCreatePlayers(ctx: TelegramCallbackQueryContext) {
        const pending = this.requirePendingCreation(ctx.from.id);
        const numberOfPlayers = parseInt(ctx.match[1]!);

        pending.numberOfPlayers = numberOfPlayers;
        pending.step = 'points';
        pending.timestamp = Date.now();

        const presets = [0, 25000, 30000, 35000];
        const labels: Record<number, string> = { 0: '0 (EMA)', 25000: '25,000', 30000: '30,000', 35000: '35,000' };

        ctx.reply('Стартові очки:', {
            reply_markup: {
                inline_keyboard: presets.map(p => ([{
                    text: labels[p]!,
                    callback_data: `gr_create_pts_${p}`
                }]))
            }
        });
    }

    handleCreatePoints(ctx: TelegramCallbackQueryContext) {
        const pending = this.requirePendingCreation(ctx.from.id);
        const startingPoints = parseInt(ctx.match[1]!);

        pending.startingPoints = startingPoints;
        pending.step = 'uma';
        pending.timestamp = Date.now();

        const presets = umaPresetsFor(pending.numberOfPlayers!);

        ctx.reply('Ума:', {
            reply_markup: {
                inline_keyboard: presets.map((preset, index) => ([{
                    text: preset.label,
                    callback_data: `gr_create_uma_${index}`
                }]))
            }
        });
    }

    handleCreateUma(ctx: TelegramCallbackQueryContext) {
        const pending = this.requirePendingCreation(ctx.from.id);
        const index = parseInt(ctx.match[1]!);

        const presets = umaPresetsFor(pending.numberOfPlayers!);
        const preset = presets[index];
        if (!preset) {
            ctx.reply('Невідомий варіант ума.');
            return;
        }

        pending.uma = preset.value;
        pending.umaLabel = preset.label;
        pending.step = 'tiebreak';
        pending.timestamp = Date.now();

        ctx.reply('Правило при рівних очках (ума):', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'За вітром (WIND)', callback_data: 'gr_create_tiebreak_WIND' }],
                    [{ text: 'Ділити порівну (DIVIDE)', callback_data: 'gr_create_tiebreak_DIVIDE' }]
                ]
            }
        });
    }

    handleCreateTiebreak(ctx: TelegramCallbackQueryContext) {
        const pending = this.requirePendingCreation(ctx.from.id);
        const tiebreak = ctx.match[1]!;

        pending.umaTieBreak = tiebreak;
        pending.step = 'chombo';
        pending.timestamp = Date.now();

        ctx.reply('Чомбо:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Без чомбо', callback_data: 'gr_create_chombo_none' }],
                    [{ text: '20,000 після ума', callback_data: 'gr_create_chombo_20000' }]
                ]
            }
        });
    }

    handleCreateChombo(ctx: TelegramCallbackQueryContext) {
        const pending = this.requirePendingCreation(ctx.from.id);
        const raw = ctx.match[1]!;

        pending.chomboPointsAfterUma = raw === 'none' ? null : parseInt(raw);
        pending.step = 'confirm';
        pending.timestamp = Date.now();

        ctx.replyWithHTML(
            this.buildCreationSummary(pending),
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '✅ Створити', callback_data: 'gr_create_confirm' },
                        { text: '❌ Скасувати', callback_data: 'gr_create_cancel' }
                    ]]
                }
            }
        );
    }

    async handleCreateConfirm(ctx: TelegramCallbackQueryContext) {
        const pending = this.requirePendingCreation(ctx.from.id);
        if (pending.step !== 'confirm') {
            ctx.reply('Неможливо зберегти — заповніть всі кроки.');
            return;
        }

        const user = this.getUserByTelegramId(ctx.from.id);
        const created = this.gameRulesService.createGameRules({
            name: pending.name!,
            numberOfPlayers: pending.numberOfPlayers!,
            uma: pending.uma!,
            startingPoints: pending.startingPoints!,
            chomboPointsAfterUma: pending.chomboPointsAfterUma ?? null,
            umaTieBreak: pending.umaTieBreak!,
            clubId: pending.clubId
        }, user.id);

        this.pendingCreations.delete(ctx.from.id);

        this.pendingUploads.set(ctx.from.id, {
            gameRulesId: created.id,
            gameRulesName: created.name,
            clubId: created.clubId,
            timestamp: Date.now()
        });

        const templateBuffer = Buffer.from(JSON.stringify(BASE_TEMPLATE, null, 2), 'utf-8');
        await ctx.replyWithDocument(
            { source: templateBuffer, filename: `${created.name}.json` },
            { caption: '📎 Базовий шаблон — завантажте, відредагуйте та надішліть назад' }
        );

        await ctx.replyWithHTML(
            `✅ Правила "<b>${created.name}</b>" створено.\n\n`
            + `Ви можете зараз завантажити деталі правил: відредагуйте шаблон вище та надішліть .json файл протягом 5 хвилин.\n\n`
            + `Або натисніть <b>Пропустити</b> — деталі завжди можна додати чи оновити пізніше через /game_rules → ✏️ Оновити правила.`,
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: 'Пропустити', callback_data: 'gr_create_skip_details' }
                    ]]
                }
            }
        );
    }

    handleCreateCancel(ctx: TelegramCallbackQueryContext) {
        this.pendingCreations.delete(ctx.from.id);
        ctx.reply('❌ Скасовано');
    }

    handleCreateSkipDetails(ctx: TelegramCallbackQueryContext) {
        this.pendingUploads.delete(ctx.from.id);
        ctx.reply('Готово. Деталі можна додати пізніше через /game_rules → Оновити.');
    }

    private getActivePendingCreation(userId: number): PendingCreation | undefined {
        const pending = this.pendingCreations.get(userId);
        if (!pending) return undefined;
        if (Date.now() - pending.timestamp > PENDING_CREATION_TTL_MS) {
            this.pendingCreations.delete(userId);
            return undefined;
        }
        return pending;
    }

    private requirePendingCreation(userId: number): PendingCreation {
        const pending = this.getActivePendingCreation(userId);
        if (!pending) {
            throw new TelegramPendingCreationMissingError();
        }
        return pending;
    }

    private buildCreationSummary(pending: PendingCreation): string {
        const chombo = pending.chomboPointsAfterUma === null || pending.chomboPointsAfterUma === undefined
            ? 'без чомбо'
            : `${pending.chomboPointsAfterUma} після ума`;
        const tiebreakLabel = pending.umaTieBreak === 'WIND' ? 'За вітром (WIND)' : 'Ділити порівну (DIVIDE)';
        return `📋 <b>Нові правила</b>\n\n`
            + `<b>Назва:</b> ${pending.name}\n`
            + `<b>Гравців:</b> ${pending.numberOfPlayers}\n`
            + `<b>Стартові очки:</b> ${pending.startingPoints}\n`
            + `<b>Ума:</b> ${pending.umaLabel}\n`
            + `<b>Рівні ума:</b> ${tiebreakLabel}\n`
            + `<b>Чомбо:</b> ${chombo}\n`;
    }

    hasPendingCreation(userId: number): boolean {
        return this.getActivePendingCreation(userId) !== undefined;
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

        const rules = this.gameRulesService.getAllGameRules(clubId)
            .filter(r => r.clubId === clubId);

        if (rules.length === 0) {
            ctx.reply('Правил для цього клубу не знайдено.');
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

    async handleUpdateRules(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const rulesId = parseInt(ctx.match[1]!);
        const rules = this.gameRulesService.getGameRulesById(rulesId);

        if (rules.clubId !== null) {
            this.validateUserCanEditClub(user, rules.clubId);
        }

        // Send existing file so user can download and edit it; fall back to template when empty
        const source = rules.details ?? BASE_TEMPLATE;
        const caption = rules.details !== null
            ? '📎 Поточна версія — завантажте, відредагуйте та надішліть назад'
            : '📎 Базовий шаблон — завантажте, відредагуйте та надішліть назад';
        const buffer = Buffer.from(JSON.stringify(source, null, 2), 'utf-8');
        await ctx.replyWithDocument(
            { source: buffer, filename: `${rules.name}.json` },
            { caption }
        );

        this.pendingUploads.set(ctx.from.id, {
            gameRulesId: rulesId,
            gameRulesName: rules.name,
            clubId: rules.clubId,
            timestamp: Date.now()
        });

        ctx.reply(`Надішліть JSON файл з оновленими деталями для "${rules.name}". У вас є 5 хвилин.`);
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

            const existingRules = this.gameRulesService.getGameRulesById(pending.gameRulesId);

            // Build diff summary
            const summary = buildDiffSummary(existingRules.details, newDetails);

            // Store parsed details
            pending.parsedDetails = newDetails;

            ctx.replyWithHTML(
                `📖 <b>Зміни для "${pending.gameRulesName}":</b>\n${summary}`,
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

function buildDiffSection(title: string, added: string[], changed: string[], removed: string[]): string | null {
    if (added.length === 0 && changed.length === 0 && removed.length === 0) return null;

    const lines: string[] = [`<b>${title}</b>`];
    if (added.length > 0) {
        lines.push(`\n🟢 Додано:`);
        added.forEach(name => lines.push(`  • ${name}`));
    }
    if (changed.length > 0) {
        lines.push(`\n🟡 Змінено:`);
        changed.forEach(name => lines.push(`  • ${name}`));
    }
    if (removed.length > 0) {
        lines.push(`\n🔴 Видалено:`);
        removed.forEach(name => lines.push(`  • ${name}`));
    }
    return lines.join('\n');
}

function buildDiffSummary(oldDetails: GameRulesDetails | null, newDetails: GameRulesDetails): string {
    if (oldDetails === null) {
        return `<b>📋 Правила</b>\n\n🟢 Додано:\n` + newDetails.rules.map(r => `  • ${r.rule}`).join('\n');
    }

    const sections: string[] = [];

    // ── Rules diff ──
    const oldRuleMap = new Map(oldDetails.rules.map(r => [r.rule, r]));
    const newRuleMap = new Map(newDetails.rules.map(r => [r.rule, r]));

    const rulesSection = buildDiffSection(
        '📋 Правила',
        newDetails.rules.filter(r => !oldRuleMap.has(r.rule)).map(r => r.rule),
        newDetails.rules.filter(r => { const old = oldRuleMap.get(r.rule); return old && JSON.stringify(old) !== JSON.stringify(r); }).map(r => r.rule),
        oldDetails.rules.filter(r => !newRuleMap.has(r.rule)).map(r => r.rule),
    );
    if (rulesSection) sections.push(rulesSection);

    // ── Links diff ──
    const oldLinks = oldDetails.links ?? [];
    const newLinks = newDetails.links ?? [];
    const oldLinkMap = new Map(oldLinks.map(l => [l.url, l]));
    const newLinkMap = new Map(newLinks.map(l => [l.url, l]));

    const linksSection = buildDiffSection(
        '🔗 Посилання',
        newLinks.filter(l => !oldLinkMap.has(l.url)).map(l => l.label),
        newLinks.filter(l => { const old = oldLinkMap.get(l.url); return old && old.label !== l.label; }).map(l => l.label),
        oldLinks.filter(l => !newLinkMap.has(l.url)).map(l => l.label),
    );
    if (linksSection) sections.push(linksSection);

    if (sections.length === 0) {
        return '✨ Змін не виявлено';
    }

    return sections.join('\n\n');
}

export default new TelegramGameRulesService();
