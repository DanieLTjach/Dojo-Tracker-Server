import { Context } from "telegraf";
import type { Message, Update } from "telegraf/types";
import { CannotDeleteGameRulesInUseTelegramError, CannotUpdateGameRulesInUseTelegramError, TelegramPendingCreationMissingError, UserNotClubOwnerTelegramError, UserNotRegisteredTelegramError } from "../error/TelegramErrors.ts";
import { CannotDeleteGameRulesInUseError, CannotUpdateGameRulesInUseError } from "../error/EventErrors.ts";
import { ClubMembershipService } from "./ClubMembershipService.ts";
import { ClubService } from "./ClubService.ts";
import { GameRulesService } from "./GameRulesService.ts";
import { UserService } from "./UserService.ts";
import LogService from "./LogService.ts";
import type { TelegramCommandContext, TelegramCallbackQueryContext, ClubData } from "../model/TelegramTypes.ts";
import type { GameRules, GameRulesDetails, GameRulesDetailsRule } from "../model/EventModels.ts";
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

type WizardStep = 'name' | 'players' | 'points' | 'uma' | 'tiebreak' | 'chombo' | 'confirm';

interface WizardState {
    clubId: number;
    step: WizardStep;
    name?: string;
    numberOfPlayers?: number;
    startingPoints?: number;
    uma?: string;
    umaLabel?: string;
    umaTieBreak?: string;
    chomboPointsAfterUma?: number | null;
    timestamp: number;
}

interface PendingEdit extends WizardState {
    gameRulesId: number;
}

const PENDING_UPLOAD_TTL_MS = 5 * 60 * 1000;
const PENDING_WIZARD_TTL_MS = 10 * 60 * 1000;

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

export function buildBaseDetails(params: {
    numberOfPlayers: number;
    startingPoints: number;
    umaLabel: string;
    umaTieBreak: string;
    chomboPointsAfterUma: number | null;
}): GameRulesDetails {
    const umaValues = params.umaLabel;
    const umaTooltipParts = umaValues.split(' / ');
    const umaTooltipContent = umaTooltipParts
        .map((v, i) => `${i + 1}-й: ${v.startsWith('-') ? v : '+' + v}`)
        .join('\n');

    const rules: GameRulesDetailsRule[] = [
        { rule: "Кількість гравців", value: String(params.numberOfPlayers) },
        { rule: "Стартові очки", value: formatNumber(params.startingPoints) },
        {
            rule: "Ума",
            value: umaValues,
            tooltip: { label: "Ума", content: `Розподіл бонусних очок за місце:\n${umaTooltipContent}` }
        },
        {
            rule: "Рівні ума",
            value: params.umaTieBreak === 'WIND' ? 'За вітром' : 'Ділити порівну'
        }
    ];

    if (params.chomboPointsAfterUma !== null) {
        rules.push({
            rule: "Чомбо",
            value: `${formatNumber(params.chomboPointsAfterUma)} після ума`
        });
    }

    return { rules };
}

function formatNumber(n: number): string {
    return n === 0 ? '0' : n.toLocaleString('uk-UA');
}

function formatPointsLabel(points: number): string {
    const labels: Record<number, string> = { 0: '0 (EMA)', 25000: '25,000', 30000: '30,000', 35000: '35,000' };
    return labels[points] ?? String(points);
}

function findUmaPresetLabel(umaString: string, numberOfPlayers: number): string {
    const presets = umaPresetsFor(numberOfPlayers);
    return presets.find(p => p.value === umaString)?.label ?? umaString;
}

function umaToString(uma: number[] | number[][]): string {
    if (Array.isArray(uma[0])) {
        return (uma as number[][]).map(row => row.join(',')).join(';');
    }
    return (uma as number[]).join(',');
}

class TelegramGameRulesService {
    private userService = new UserService();
    private clubService = new ClubService();
    private clubMembershipService = new ClubMembershipService();
    private gameRulesService = new GameRulesService();
    private pendingUploads = new Map<number, PendingUpload>();
    private pendingCreations = new Map<number, WizardState>();
    private pendingEdits = new Map<number, PendingEdit>();

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
                        [{ text: '👁 Переглянути правила', callback_data: 'gr_menu_view' }],
                        [{ text: '➕ Створити правила', callback_data: 'gr_menu_create' }],
                        [{ text: '✏️ Оновити правила', callback_data: 'gr_menu_edit' }],
                        [{ text: '📝 Оновити деталі', callback_data: 'gr_menu_details' }],
                        [{ text: '🗑 Видалити правила', callback_data: 'gr_menu_delete' }],
                    ]
                }
            }
        );
    }

    // ── Flow: Download ──

    handleDownloadMenu(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        this.ensureIsClubOwnerOrAdmin(user);

        ctx.reply('Оберіть категорію:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🏠 Мої клуби', callback_data: 'gr_dl_cat_my' }],
                    [{ text: '🌐 Глобальні правила', callback_data: 'gr_dl_cat_global' }],
                    [{ text: '🏘 Інші клуби', callback_data: 'gr_dl_cat_other' }],
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

    // ── Flow: View ──

    handleViewMenu(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubs = this.getUserOwnedClubData(user);

        ctx.reply('Оберіть клуб:', {
            reply_markup: {
                inline_keyboard: clubs.map(club => ([{
                    text: club.clubName,
                    callback_data: `gr_view_club_${club.clubId}`
                }]))
            }
        });
    }

    handleViewClub(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubId = parseInt(ctx.match[1]!);
        this.validateUserCanEditClub(user, clubId);

        const rules = this.getClubRules(clubId);

        if (rules.length === 0) {
            ctx.reply('Правил для цього клубу не знайдено.');
            return;
        }

        ctx.reply('Оберіть правила для перегляду:', {
            reply_markup: {
                inline_keyboard: rules.map(r => ([{
                    text: r.name,
                    callback_data: `gr_view_${r.id}`
                }]))
            }
        });
    }

    async handleViewRules(ctx: TelegramCallbackQueryContext) {
        this.getUserByTelegramId(ctx.from.id);

        const rulesId = parseInt(ctx.match[1]!);
        const rules = this.gameRulesService.getGameRulesById(rulesId);

        const umaStr = umaToString(rules.uma);
        const umaLabel = findUmaPresetLabel(umaStr, rules.numberOfPlayers);
        const tiebreakLabel = rules.umaTieBreak === 'WIND' ? 'За вітром' : 'Ділити порівну';
        const chombo = rules.chomboPointsAfterUma === null
            ? 'без чомбо'
            : `${formatNumber(rules.chomboPointsAfterUma)} після ума`;

        let text = `📋 <b>${rules.name}</b>\n\n`
            + `<b>Гравців:</b> ${rules.numberOfPlayers}\n`
            + `<b>Стартові очки:</b> ${formatNumber(rules.startingPoints)}\n`
            + `<b>Ума:</b> ${umaLabel}\n`
            + `<b>Рівні ума:</b> ${tiebreakLabel}\n`
            + `<b>Чомбо:</b> ${chombo}\n`
            + `<b>Деталі:</b> ${rules.details !== null ? 'є' : 'немає'}`;

        await ctx.replyWithHTML(text);

        if (rules.details !== null) {
            const buffer = Buffer.from(JSON.stringify(rules.details, null, 2), 'utf-8');
            await ctx.replyWithDocument({
                source: buffer,
                filename: `${rules.name}.json`
            });
        }
    }

    // ── Flow: Create Wizard ──

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

    handleCreatePlayers(ctx: TelegramCallbackQueryContext) {
        const pending = this.requirePendingCreation(ctx.from.id);
        pending.numberOfPlayers = parseInt(ctx.match[1]!);
        pending.step = 'points';
        pending.timestamp = Date.now();
        this.replyPointsStep(ctx, 'create');
    }

    handleCreatePoints(ctx: TelegramCallbackQueryContext) {
        const pending = this.requirePendingCreation(ctx.from.id);
        pending.startingPoints = parseInt(ctx.match[1]!);
        pending.step = 'uma';
        pending.timestamp = Date.now();
        this.replyUmaStep(ctx, 'create', pending.numberOfPlayers!);
    }

    handleCreateUma(ctx: TelegramCallbackQueryContext) {
        const pending = this.requirePendingCreation(ctx.from.id);
        const index = parseInt(ctx.match[1]!);
        const presets = umaPresetsFor(pending.numberOfPlayers!);
        const preset = presets[index];
        if (!preset) { ctx.reply('Невідомий варіант ума.'); return; }
        pending.uma = preset.value;
        pending.umaLabel = preset.label;
        pending.step = 'tiebreak';
        pending.timestamp = Date.now();
        this.replyTiebreakStep(ctx, 'create');
    }

    handleCreateTiebreak(ctx: TelegramCallbackQueryContext) {
        const pending = this.requirePendingCreation(ctx.from.id);
        pending.umaTieBreak = ctx.match[1]!;
        pending.step = 'chombo';
        pending.timestamp = Date.now();
        this.replyChomboStep(ctx, 'create');
    }

    handleCreateChombo(ctx: TelegramCallbackQueryContext) {
        const pending = this.requirePendingCreation(ctx.from.id);
        const raw = ctx.match[1]!;
        pending.chomboPointsAfterUma = raw === 'none' ? null : parseInt(raw);
        pending.step = 'confirm';
        pending.timestamp = Date.now();
        this.replyConfirmStep(ctx, 'create', pending, '📋 <b>Нові правила</b>');
    }

    handleCreateConfirm(ctx: TelegramCallbackQueryContext) {
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

        const details = buildBaseDetails({
            numberOfPlayers: pending.numberOfPlayers!,
            startingPoints: pending.startingPoints!,
            umaLabel: pending.umaLabel!,
            umaTieBreak: pending.umaTieBreak!,
            chomboPointsAfterUma: pending.chomboPointsAfterUma ?? null,
        });
        this.gameRulesService.updateGameRulesDetails(created.id, details, user.id);

        this.pendingCreations.delete(ctx.from.id);

        ctx.replyWithHTML(
            `✅ Правила "<b>${created.name}</b>" створено.\n\n`
            + `Деталі заповнено автоматично. Оновити пізніше через /game_rules → 📝 Оновити деталі.`
        );
    }

    handleCreateCancel(ctx: TelegramCallbackQueryContext) {
        this.pendingCreations.delete(ctx.from.id);
        ctx.reply('❌ Скасовано');
    }

    // ── Flow: Edit Wizard ──

    handleEditMenu(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubs = this.getUserOwnedClubData(user);

        ctx.reply('Оберіть клуб:', {
            reply_markup: {
                inline_keyboard: clubs.map(club => ([{
                    text: club.clubName,
                    callback_data: `gr_edit_club_${club.clubId}`
                }]))
            }
        });
    }

    handleEditClub(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubId = parseInt(ctx.match[1]!);
        this.validateUserCanEditClub(user, clubId);

        const rules = this.getClubRules(clubId);
        if (rules.length === 0) {
            ctx.reply('Правил для цього клубу не знайдено.');
            return;
        }

        ctx.reply('Оберіть правила для оновлення:', {
            reply_markup: {
                inline_keyboard: rules.map(r => ([{
                    text: r.name,
                    callback_data: `gr_edit_${r.id}`
                }]))
            }
        });
    }

    handleEditRules(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const rulesId = parseInt(ctx.match[1]!);
        const rules = this.gameRulesService.getGameRulesById(rulesId);

        if (rules.clubId !== null) {
            this.validateUserCanEditClub(user, rules.clubId);
        }

        const umaStr = umaToString(rules.uma);

        this.pendingEdits.set(ctx.from.id, {
            gameRulesId: rulesId,
            clubId: rules.clubId!,
            step: 'name',
            name: rules.name,
            numberOfPlayers: rules.numberOfPlayers,
            startingPoints: rules.startingPoints,
            uma: umaStr,
            umaLabel: findUmaPresetLabel(umaStr, rules.numberOfPlayers),
            umaTieBreak: rules.umaTieBreak,
            chomboPointsAfterUma: rules.chomboPointsAfterUma,
            timestamp: Date.now()
        });

        ctx.reply(`Введіть нову назву (поточна: ${rules.name}):`);
    }

    handleEditPlayers(ctx: TelegramCallbackQueryContext) {
        const pending = this.requirePendingEdit(ctx.from.id);
        pending.numberOfPlayers = parseInt(ctx.match[1]!);
        pending.step = 'points';
        pending.timestamp = Date.now();
        this.replyPointsStep(ctx, 'edit');
    }

    handleEditPoints(ctx: TelegramCallbackQueryContext) {
        const pending = this.requirePendingEdit(ctx.from.id);
        pending.startingPoints = parseInt(ctx.match[1]!);
        pending.step = 'uma';
        pending.timestamp = Date.now();
        this.replyUmaStep(ctx, 'edit', pending.numberOfPlayers!);
    }

    handleEditUma(ctx: TelegramCallbackQueryContext) {
        const pending = this.requirePendingEdit(ctx.from.id);
        const index = parseInt(ctx.match[1]!);
        const presets = umaPresetsFor(pending.numberOfPlayers!);
        const preset = presets[index];
        if (!preset) { ctx.reply('Невідомий варіант ума.'); return; }
        pending.uma = preset.value;
        pending.umaLabel = preset.label;
        pending.step = 'tiebreak';
        pending.timestamp = Date.now();
        this.replyTiebreakStep(ctx, 'edit');
    }

    handleEditTiebreak(ctx: TelegramCallbackQueryContext) {
        const pending = this.requirePendingEdit(ctx.from.id);
        pending.umaTieBreak = ctx.match[1]!;
        pending.step = 'chombo';
        pending.timestamp = Date.now();
        this.replyChomboStep(ctx, 'edit');
    }

    handleEditChombo(ctx: TelegramCallbackQueryContext) {
        const pending = this.requirePendingEdit(ctx.from.id);
        const raw = ctx.match[1]!;
        pending.chomboPointsAfterUma = raw === 'none' ? null : parseInt(raw);
        pending.step = 'confirm';
        pending.timestamp = Date.now();
        this.replyConfirmStep(ctx, 'edit', pending, '✏️ <b>Оновлення правил</b>');
    }

    handleEditConfirm(ctx: TelegramCallbackQueryContext) {
        const pending = this.requirePendingEdit(ctx.from.id);
        if (pending.step !== 'confirm') {
            ctx.reply('Неможливо зберегти — заповніть всі кроки.');
            return;
        }

        const user = this.getUserByTelegramId(ctx.from.id);
        try {
            this.gameRulesService.updateGameRules(pending.gameRulesId, {
                name: pending.name!,
                numberOfPlayers: pending.numberOfPlayers!,
                uma: pending.uma!,
                startingPoints: pending.startingPoints!,
                chomboPointsAfterUma: pending.chomboPointsAfterUma ?? null,
                umaTieBreak: pending.umaTieBreak!,
                clubId: pending.clubId
            }, user.id);

            const details = buildBaseDetails({
                numberOfPlayers: pending.numberOfPlayers!,
                startingPoints: pending.startingPoints!,
                umaLabel: pending.umaLabel!,
                umaTieBreak: pending.umaTieBreak!,
                chomboPointsAfterUma: pending.chomboPointsAfterUma ?? null,
            });
            this.gameRulesService.updateGameRulesDetails(pending.gameRulesId, details, user.id);
        } catch (error) {
            if (error instanceof CannotUpdateGameRulesInUseError) {
                throw new CannotUpdateGameRulesInUseTelegramError(error.gameRulesName, error.eventCount);
            }
            throw error;
        }

        this.pendingEdits.delete(ctx.from.id);
        ctx.replyWithHTML(`✅ Правила "<b>${pending.name}</b>" оновлено. Деталі перегенеровано.`);
    }

    handleEditCancel(ctx: TelegramCallbackQueryContext) {
        this.pendingEdits.delete(ctx.from.id);
        ctx.reply('❌ Скасовано');
    }

    // ── Flow: Update Details ──

    handleDetailsMenu(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubs = this.getUserOwnedClubData(user);

        ctx.reply('Оберіть клуб:', {
            reply_markup: {
                inline_keyboard: clubs.map(club => ([{
                    text: club.clubName,
                    callback_data: `gr_details_club_${club.clubId}`
                }]))
            }
        });
    }

    handleDetailsClub(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const clubId = parseInt(ctx.match[1]!);
        this.validateUserCanEditClub(user, clubId);

        const rules = this.getClubRules(clubId);
        if (rules.length === 0) {
            ctx.reply('Правил для цього клубу не знайдено.');
            return;
        }

        ctx.reply('Оберіть правила для оновлення деталей:', {
            reply_markup: {
                inline_keyboard: rules.map(r => ([{
                    text: r.name,
                    callback_data: `gr_details_${r.id}`
                }]))
            }
        });
    }

    async handleDetailsRules(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const rulesId = parseInt(ctx.match[1]!);
        const rules = this.gameRulesService.getGameRulesById(rulesId);

        if (rules.clubId !== null) {
            this.validateUserCanEditClub(user, rules.clubId);
        }

        const source = rules.details ?? buildBaseDetails({
            numberOfPlayers: rules.numberOfPlayers,
            startingPoints: rules.startingPoints,
            umaLabel: findUmaPresetLabel(umaToString(rules.uma), rules.numberOfPlayers),
            umaTieBreak: rules.umaTieBreak,
            chomboPointsAfterUma: rules.chomboPointsAfterUma,
        });
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

    // ── Flow: Document Upload Handler ──

    async handleDocumentUpload(ctx: Context<{ message: Update.New & Update.NonChannel & Message.DocumentMessage; update_id: number }>) {
        const userId = ctx.from.id;
        const pending = this.pendingUploads.get(userId);

        if (!pending) return;

        if (Date.now() - pending.timestamp > PENDING_UPLOAD_TTL_MS) {
            this.pendingUploads.delete(userId);
            ctx.reply('Час вичерпано, спробуйте ще раз.');
            return;
        }

        const document = ctx.message.document;

        if (!document.file_name?.endsWith('.json')) {
            this.pendingUploads.delete(userId);
            ctx.reply('Файл повинен мати розширення .json');
            return;
        }

        try {
            const fileLink = await ctx.telegram.getFileLink(document.file_id);
            const response = await fetch(fileLink.toString());
            const text = await response.text();

            let parsed: unknown;
            try {
                parsed = JSON.parse(text);
            } catch {
                this.pendingUploads.delete(userId);
                ctx.reply('Невалідний JSON файл.');
                return;
            }

            const result = gameRulesDetailsSchema.safeParse(parsed);
            if (!result.success) {
                this.pendingUploads.delete(userId);
                const errors = result.error.issues.map(i => `• ${i.path.join('.')}: ${i.message}`).join('\n');
                ctx.replyWithHTML(`❌ <b>Помилки валідації:</b>\n${errors}`);
                return;
            }

            const newDetails = result.data as GameRulesDetails;
            const existingRules = this.gameRulesService.getGameRulesById(pending.gameRulesId);
            const summary = buildDiffSummary(existingRules.details, newDetails);

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

    // ── Flow: Confirm / Cancel Details Upload ──

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

    // ── Flow: Delete Record ──

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

        const rules = this.getClubRules(clubId);

        if (rules.length === 0) {
            ctx.reply('Правил для цього клубу не знайдено.');
            return;
        }

        ctx.reply('Оберіть правила для видалення:', {
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
            `Видалити правила "<b>${rules.name}</b>"?`,
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

    handleDeleteConfirm(ctx: TelegramCallbackQueryContext) {
        const user = this.getUserByTelegramId(ctx.from.id);
        const rulesId = parseInt(ctx.match[1]!);
        const rules = this.gameRulesService.getGameRulesById(rulesId);

        if (rules.clubId !== null) {
            this.validateUserCanEditClub(user, rules.clubId);
        }

        try {
            this.gameRulesService.deleteGameRules(rulesId, user.id);
        } catch (error) {
            if (error instanceof CannotDeleteGameRulesInUseError) {
                throw new CannotDeleteGameRulesInUseTelegramError(error.gameRulesName, error.eventCount);
            }
            throw error;
        }

        ctx.reply(`✅ Правила "${rules.name}" видалено`);
    }

    // ── Text Input Handler ──

    handleTextInput(ctx: Context<{ message: Update.New & Update.NonChannel & Message.TextMessage; update_id: number }>): boolean {
        const userId = ctx.from.id;

        const pendingCreate = this.getActiveWizardState(this.pendingCreations, userId);
        if (pendingCreate && pendingCreate.step === 'name') {
            return this.handleNameInput(ctx, pendingCreate, 'create');
        }

        const pendingEdit = this.getActiveWizardState(this.pendingEdits, userId);
        if (pendingEdit && pendingEdit.step === 'name') {
            return this.handleNameInput(ctx, pendingEdit, 'edit');
        }

        return false;
    }

    private handleNameInput(
        ctx: Context<{ message: Update.New & Update.NonChannel & Message.TextMessage; update_id: number }>,
        pending: WizardState,
        prefix: string
    ): boolean {
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
                    { text: '3 гравці', callback_data: `gr_${prefix}_players_3` },
                    { text: '4 гравці', callback_data: `gr_${prefix}_players_4` }
                ]]
            }
        });
        return true;
    }

    // ── Shared Wizard Step Renderers ──

    private replyPointsStep(ctx: TelegramCallbackQueryContext, prefix: string) {
        const presets = [0, 25000, 30000, 35000];
        ctx.reply('Стартові очки:', {
            reply_markup: {
                inline_keyboard: presets.map(p => ([{
                    text: formatPointsLabel(p),
                    callback_data: `gr_${prefix}_pts_${p}`
                }]))
            }
        });
    }

    private replyUmaStep(ctx: TelegramCallbackQueryContext, prefix: string, numberOfPlayers: number) {
        const presets = umaPresetsFor(numberOfPlayers);
        ctx.reply('Ума:', {
            reply_markup: {
                inline_keyboard: presets.map((preset, index) => ([{
                    text: preset.label,
                    callback_data: `gr_${prefix}_uma_${index}`
                }]))
            }
        });
    }

    private replyTiebreakStep(ctx: TelegramCallbackQueryContext, prefix: string) {
        ctx.reply('Правило при рівних очках (ума):', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'За вітром (WIND)', callback_data: `gr_${prefix}_tiebreak_WIND` }],
                    [{ text: 'Ділити порівну (DIVIDE)', callback_data: `gr_${prefix}_tiebreak_DIVIDE` }]
                ]
            }
        });
    }

    private replyChomboStep(ctx: TelegramCallbackQueryContext, prefix: string) {
        ctx.reply('Чомбо:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Без чомбо', callback_data: `gr_${prefix}_chombo_none` }],
                    [{ text: '20,000 після ума', callback_data: `gr_${prefix}_chombo_20000` }]
                ]
            }
        });
    }

    private replyConfirmStep(ctx: TelegramCallbackQueryContext, prefix: string, state: WizardState, title: string) {
        const chombo = state.chomboPointsAfterUma === null || state.chomboPointsAfterUma === undefined
            ? 'без чомбо'
            : `${formatNumber(state.chomboPointsAfterUma)} після ума`;
        const tiebreakLabel = state.umaTieBreak === 'WIND' ? 'За вітром (WIND)' : 'Ділити порівну (DIVIDE)';
        const summary = `${title}\n\n`
            + `<b>Назва:</b> ${state.name}\n`
            + `<b>Гравців:</b> ${state.numberOfPlayers}\n`
            + `<b>Стартові очки:</b> ${formatNumber(state.startingPoints!)}\n`
            + `<b>Ума:</b> ${state.umaLabel}\n`
            + `<b>Рівні ума:</b> ${tiebreakLabel}\n`
            + `<b>Чомбо:</b> ${chombo}\n`;

        ctx.replyWithHTML(summary, {
            reply_markup: {
                inline_keyboard: [[
                    { text: '✅ Зберегти', callback_data: `gr_${prefix}_confirm` },
                    { text: '❌ Скасувати', callback_data: `gr_${prefix}_cancel` }
                ]]
            }
        });
    }

    // ── Wizard State Helpers ──

    private getActiveWizardState<T extends WizardState>(map: Map<number, T>, userId: number): T | undefined {
        const pending = map.get(userId);
        if (!pending) return undefined;
        if (Date.now() - pending.timestamp > PENDING_WIZARD_TTL_MS) {
            map.delete(userId);
            return undefined;
        }
        return pending;
    }

    private requirePendingCreation(userId: number): WizardState {
        const pending = this.getActiveWizardState(this.pendingCreations, userId);
        if (!pending) throw new TelegramPendingCreationMissingError();
        return pending;
    }

    private requirePendingEdit(userId: number): PendingEdit {
        const pending = this.getActiveWizardState(this.pendingEdits, userId);
        if (!pending) throw new TelegramPendingCreationMissingError();
        return pending;
    }

    hasPendingWizard(userId: number): boolean {
        return this.getActiveWizardState(this.pendingCreations, userId) !== undefined
            || this.getActiveWizardState(this.pendingEdits, userId) !== undefined;
    }

    hasPendingUpload(userId: number): boolean {
        return this.pendingUploads.has(userId);
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

    private getClubRules(clubId: number): GameRules[] {
        return this.gameRulesService.getAllGameRules(clubId)
            .filter(r => r.clubId === clubId);
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

    const oldRuleMap = new Map(oldDetails.rules.map(r => [r.rule, r]));
    const newRuleMap = new Map(newDetails.rules.map(r => [r.rule, r]));

    const rulesSection = buildDiffSection(
        '📋 Правила',
        newDetails.rules.filter(r => !oldRuleMap.has(r.rule)).map(r => r.rule),
        newDetails.rules.filter(r => { const old = oldRuleMap.get(r.rule); return old && JSON.stringify(old) !== JSON.stringify(r); }).map(r => r.rule),
        oldDetails.rules.filter(r => !newRuleMap.has(r.rule)).map(r => r.rule),
    );
    if (rulesSection) sections.push(rulesSection);

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
