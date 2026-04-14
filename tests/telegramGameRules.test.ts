import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import telegramGameRulesService, { buildBaseDetails } from '../src/service/TelegramGameRulesService.ts';
import { GameRulesRepository } from '../src/repository/GameRulesRepository.ts';
import { CannotUpdateGameRulesInUseTelegramError, UserNotClubOwnerTelegramError, UserNotRegisteredTelegramError } from '../src/error/TelegramErrors.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';

const TEST_CLUB_ID = 700;
const OWNER_USER_ID = 701;
const OWNER_TELEGRAM_ID = 700701;
const NON_OWNER_USER_ID = 702;
const NON_OWNER_TELEGRAM_ID = 700702;
const UNREGISTERED_TELEGRAM_ID = 999999;
const timestamp = '2026-01-01T00:00:00.000Z';
const repo = new GameRulesRepository();

function mockCallbackCtx(telegramId: number, match: string[] = []): any {
    const replies: any[] = [];
    const documents: any[] = [];
    return {
        from: { id: telegramId },
        match,
        reply: jest.fn((...args: any[]) => { replies.push(args); }),
        replyWithHTML: jest.fn((...args: any[]) => { replies.push(args); }),
        replyWithDocument: jest.fn((...args: any[]) => { documents.push(args); }),
        _replies: replies,
        _documents: documents,
    };
}

function mockTextCtx(telegramId: number, text: string): any {
    const replies: any[] = [];
    return {
        from: { id: telegramId },
        message: { text },
        reply: jest.fn((...args: any[]) => { replies.push(args); }),
        replyWithHTML: jest.fn((...args: any[]) => { replies.push(args); }),
        replyWithDocument: jest.fn(),
        _replies: replies,
    };
}

describe('TelegramGameRulesService', () => {
    beforeAll(() => {
        dbManager.db.prepare(
            `INSERT INTO club (id, name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(TEST_CLUB_ID, 'TG Test Club', null, null, null, null, 1, timestamp, timestamp, 0);

        dbManager.db.prepare(
            `INSERT OR IGNORE INTO user (id, telegramId, name, isActive, isAdmin, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(OWNER_USER_ID, OWNER_TELEGRAM_ID, 'tg-owner', 1, 0, timestamp, timestamp, 0);

        dbManager.db.prepare(
            `INSERT OR IGNORE INTO user (id, telegramId, name, isActive, isAdmin, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(NON_OWNER_USER_ID, NON_OWNER_TELEGRAM_ID, 'tg-nonowner', 1, 0, timestamp, timestamp, 0);

        dbManager.db.prepare(
            `INSERT INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(TEST_CLUB_ID, OWNER_USER_ID, 'OWNER', 'ACTIVE', timestamp, timestamp, 0);

        dbManager.db.prepare(
            `INSERT INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(TEST_CLUB_ID, NON_OWNER_USER_ID, 'MEMBER', 'ACTIVE', timestamp, timestamp, 0);
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM event WHERE clubId = ?').run(TEST_CLUB_ID);
        dbManager.db.prepare('DELETE FROM gameRules WHERE clubId = ?').run(TEST_CLUB_ID);
        dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ?').run(TEST_CLUB_ID);
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?)').run(OWNER_USER_ID, NON_OWNER_USER_ID);
        dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(TEST_CLUB_ID);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('buildBaseDetails', () => {
        test('4-player with chombo', () => {
            const result = buildBaseDetails({
                numberOfPlayers: 4,
                startingPoints: 25000,
                umaLabel: '15 / 5 / -5 / -15',
                umaTieBreak: 'WIND',
                chomboPointsAfterUma: 20000,
            });

            expect(result.rules.length).toBe(5);
            expect(result.rules[0]).toEqual({ rule: 'Кількість гравців', value: '4' });
            expect(result.rules[1]!.rule).toBe('Стартові очки');
            expect(result.rules[2]!.rule).toBe('Ума');
            expect(result.rules[2]!.tooltip).toBeDefined();
            expect(result.rules[3]!.rule).toBe('Рівні ума');
            expect(result.rules[3]!.value).toBe('За вітром');
            expect(result.rules[4]!.rule).toBe('Чомбо');
        });

        test('3-player without chombo', () => {
            const result = buildBaseDetails({
                numberOfPlayers: 3,
                startingPoints: 0,
                umaLabel: '15 / 0 / -15',
                umaTieBreak: 'DIVIDE',
                chomboPointsAfterUma: null,
            });

            expect(result.rules.length).toBe(4);
            expect(result.rules[0]!.value).toBe('3');
            expect(result.rules[1]!.value).toBe('0');
            expect(result.rules[3]!.value).toBe('Ділити порівну');
            expect(result.rules.find(r => r.rule === 'Чомбо')).toBeUndefined();
        });

        test('has no links by default', () => {
            const result = buildBaseDetails({
                numberOfPlayers: 4,
                startingPoints: 30000,
                umaLabel: '15 / 5 / -5 / -15',
                umaTieBreak: 'WIND',
                chomboPointsAfterUma: null,
            });
            expect(result.links).toBeUndefined();
        });
    });

    describe('Create wizard — full happy path', () => {
        test('creates game rules with auto-generated details', () => {
            // Step 1: club
            const ctx1 = mockCallbackCtx(OWNER_TELEGRAM_ID, ['gr_create_club_700', '700']);
            telegramGameRulesService.handleCreateClub(ctx1);
            expect(ctx1.reply).toHaveBeenCalled();
            expect(telegramGameRulesService.hasPendingWizard(OWNER_TELEGRAM_ID)).toBe(true);

            // Step 2: name text
            const ctx2 = mockTextCtx(OWNER_TELEGRAM_ID, 'Wizard Test Rules');
            const handled = telegramGameRulesService.handleTextInput(ctx2);
            expect(handled).toBe(true);
            expect(ctx2.reply).toHaveBeenCalled();

            // Step 3: players
            const ctx3 = mockCallbackCtx(OWNER_TELEGRAM_ID, ['gr_create_players_4', '4']);
            telegramGameRulesService.handleCreatePlayers(ctx3);

            // Step 4: points
            const ctx4 = mockCallbackCtx(OWNER_TELEGRAM_ID, ['gr_create_pts_25000', '25000']);
            telegramGameRulesService.handleCreatePoints(ctx4);

            // Step 5: uma
            const ctx5 = mockCallbackCtx(OWNER_TELEGRAM_ID, ['gr_create_uma_0', '0']);
            telegramGameRulesService.handleCreateUma(ctx5);

            // Step 6: tiebreak
            const ctx6 = mockCallbackCtx(OWNER_TELEGRAM_ID, ['gr_create_tiebreak_WIND', 'WIND']);
            telegramGameRulesService.handleCreateTiebreak(ctx6);

            // Step 7: chombo
            const ctx7 = mockCallbackCtx(OWNER_TELEGRAM_ID, ['gr_create_chombo_20000', '20000']);
            telegramGameRulesService.handleCreateChombo(ctx7);

            // Step 8: confirm
            const ctx8 = mockCallbackCtx(OWNER_TELEGRAM_ID);
            telegramGameRulesService.handleCreateConfirm(ctx8);
            expect(ctx8.replyWithHTML).toHaveBeenCalled();
            expect(telegramGameRulesService.hasPendingWizard(OWNER_TELEGRAM_ID)).toBe(false);

            // Verify DB
            const allRules = repo.findAllGameRules();
            const created = allRules.find(r => r.name === 'Wizard Test Rules');
            expect(created).toBeDefined();
            expect(created!.numberOfPlayers).toBe(4);
            expect(created!.startingPoints).toBe(25000);
            expect(created!.details).not.toBeNull();
            expect(created!.details!.rules.length).toBe(5);
        });
    });

    describe('Edit wizard — full happy path', () => {
        let editRuleId: number;

        beforeAll(() => {
            editRuleId = repo.insertGameRules({
                name: 'Edit Test Rules',
                numberOfPlayers: 4,
                uma: '15,5,-5,-15',
                startingPoints: 25000,
                chomboPointsAfterUma: null,
                umaTieBreak: 'DIVIDE',
                clubId: TEST_CLUB_ID
            });
        });

        test('updates game rules fields and regenerates details', () => {
            // Select rule to edit
            const ctx1 = mockCallbackCtx(OWNER_TELEGRAM_ID, [`gr_edit_${editRuleId}`, String(editRuleId)]);
            telegramGameRulesService.handleEditRules(ctx1);
            expect(telegramGameRulesService.hasPendingWizard(OWNER_TELEGRAM_ID)).toBe(true);

            // Name
            const ctx2 = mockTextCtx(OWNER_TELEGRAM_ID, 'Edited Rules Name');
            telegramGameRulesService.handleTextInput(ctx2);

            // Players
            const ctx3 = mockCallbackCtx(OWNER_TELEGRAM_ID, ['gr_edit_players_3', '3']);
            telegramGameRulesService.handleEditPlayers(ctx3);

            // Points
            const ctx4 = mockCallbackCtx(OWNER_TELEGRAM_ID, ['gr_edit_pts_0', '0']);
            telegramGameRulesService.handleEditPoints(ctx4);

            // Uma
            const ctx5 = mockCallbackCtx(OWNER_TELEGRAM_ID, ['gr_edit_uma_0', '0']);
            telegramGameRulesService.handleEditUma(ctx5);

            // Tiebreak
            const ctx6 = mockCallbackCtx(OWNER_TELEGRAM_ID, ['gr_edit_tiebreak_WIND', 'WIND']);
            telegramGameRulesService.handleEditTiebreak(ctx6);

            // Chombo
            const ctx7 = mockCallbackCtx(OWNER_TELEGRAM_ID, ['gr_edit_chombo_none', 'none']);
            telegramGameRulesService.handleEditChombo(ctx7);

            // Confirm
            const ctx8 = mockCallbackCtx(OWNER_TELEGRAM_ID);
            telegramGameRulesService.handleEditConfirm(ctx8);
            expect(ctx8.replyWithHTML).toHaveBeenCalled();

            const updated = repo.findGameRulesById(editRuleId);
            expect(updated!.name).toBe('Edited Rules Name');
            expect(updated!.numberOfPlayers).toBe(3);
            expect(updated!.startingPoints).toBe(0);
            expect(updated!.details).not.toBeNull();
            expect(updated!.details!.rules.find(r => r.rule === 'Чомбо')).toBeUndefined();
        });

        test('blocks update when rule is referenced by event', () => {
            const ruleId = repo.insertGameRules({
                name: 'Referenced Edit Rules',
                numberOfPlayers: 4,
                uma: '15,5,-5,-15',
                startingPoints: 25000,
                chomboPointsAfterUma: null,
                umaTieBreak: 'DIVIDE',
                clubId: TEST_CLUB_ID
            });
            const eventId = 7002;
            dbManager.db.prepare(
                `INSERT INTO event (id, name, type, gameRules, clubId, startingRating, minimumGamesForRating, modifiedBy, createdAt, modifiedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(eventId, 'Edit Block Event', 'SEASON', ruleId, TEST_CLUB_ID, 0, 0, 0, timestamp, timestamp);

            try {
                telegramGameRulesService.handleEditRules(mockCallbackCtx(OWNER_TELEGRAM_ID, [`gr_edit_${ruleId}`, String(ruleId)]));
                telegramGameRulesService.handleTextInput(mockTextCtx(OWNER_TELEGRAM_ID, 'Blocked Edit Rules'));
                telegramGameRulesService.handleEditPlayers(mockCallbackCtx(OWNER_TELEGRAM_ID, ['gr_edit_players_3', '3']));
                telegramGameRulesService.handleEditPoints(mockCallbackCtx(OWNER_TELEGRAM_ID, ['gr_edit_pts_0', '0']));
                telegramGameRulesService.handleEditUma(mockCallbackCtx(OWNER_TELEGRAM_ID, ['gr_edit_uma_0', '0']));
                telegramGameRulesService.handleEditTiebreak(mockCallbackCtx(OWNER_TELEGRAM_ID, ['gr_edit_tiebreak_WIND', 'WIND']));
                telegramGameRulesService.handleEditChombo(mockCallbackCtx(OWNER_TELEGRAM_ID, ['gr_edit_chombo_none', 'none']));

                expect(() => telegramGameRulesService.handleEditConfirm(mockCallbackCtx(OWNER_TELEGRAM_ID)))
                    .toThrow(CannotUpdateGameRulesInUseTelegramError);

                const fetched = repo.findGameRulesById(ruleId);
                expect(fetched!.name).toBe('Referenced Edit Rules');
                expect(fetched!.numberOfPlayers).toBe(4);
                expect(fetched!.startingPoints).toBe(25000);
            } finally {
                telegramGameRulesService.handleEditCancel(mockCallbackCtx(OWNER_TELEGRAM_ID));
                dbManager.db.prepare('DELETE FROM event WHERE id = ?').run(eventId);
                repo.deleteGameRules(ruleId);
            }
        });
    });

    describe('View flow', () => {
        let viewRuleId: number;

        beforeAll(() => {
            viewRuleId = repo.insertGameRules({
                name: 'View Test Rules',
                numberOfPlayers: 4,
                uma: '15,5,-5,-15',
                startingPoints: 25000,
                chomboPointsAfterUma: null,
                umaTieBreak: 'DIVIDE',
                clubId: TEST_CLUB_ID
            });
        });

        test('shows rule summary', async () => {
            const ctx = mockCallbackCtx(OWNER_TELEGRAM_ID, [`gr_view_${viewRuleId}`, String(viewRuleId)]);
            await telegramGameRulesService.handleViewRules(ctx);
            expect(ctx.replyWithHTML).toHaveBeenCalled();
            const html = ctx.replyWithHTML.mock.calls[0][0];
            expect(html).toContain('View Test Rules');
            expect(html).toContain('25');
        });
    });

    describe('Delete flow', () => {
        test('deletes unused rule', () => {
            const ruleId = repo.insertGameRules({
                name: 'Delete Test Rules',
                numberOfPlayers: 4,
                uma: '15,5,-5,-15',
                startingPoints: 25000,
                chomboPointsAfterUma: null,
                umaTieBreak: 'DIVIDE',
                clubId: TEST_CLUB_ID
            });

            const ctx1 = mockCallbackCtx(OWNER_TELEGRAM_ID, [`gr_del_${ruleId}`, String(ruleId)]);
            telegramGameRulesService.handleDeleteRules(ctx1);
            expect(ctx1.replyWithHTML).toHaveBeenCalled();

            const ctx2 = mockCallbackCtx(OWNER_TELEGRAM_ID, [`gr_del_confirm_${ruleId}`, String(ruleId)]);
            telegramGameRulesService.handleDeleteConfirm(ctx2);
            expect(ctx2.reply).toHaveBeenCalledWith(expect.stringContaining('видалено'));

            expect(repo.findGameRulesById(ruleId)).toBeUndefined();
        });

        test('blocks delete when rule is referenced by event', () => {
            const ruleId = repo.insertGameRules({
                name: 'Referenced Delete Rules',
                numberOfPlayers: 4,
                uma: '15,5,-5,-15',
                startingPoints: 25000,
                chomboPointsAfterUma: null,
                umaTieBreak: 'DIVIDE',
                clubId: TEST_CLUB_ID
            });
            const eventId = 7001;
            dbManager.db.prepare(
                `INSERT INTO event (id, name, type, gameRules, clubId, startingRating, minimumGamesForRating, modifiedBy, createdAt, modifiedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(eventId, 'FK Block Event', 'SEASON', ruleId, TEST_CLUB_ID, 0, 0, 0, timestamp, timestamp);

            const ctx = mockCallbackCtx(OWNER_TELEGRAM_ID, [`gr_del_confirm_${ruleId}`, String(ruleId)]);
            expect(() => telegramGameRulesService.handleDeleteConfirm(ctx)).toThrow();

            expect(repo.findGameRulesById(ruleId)).toBeDefined();

            dbManager.db.prepare('DELETE FROM event WHERE id = ?').run(eventId);
            repo.deleteGameRules(ruleId);
        });
    });

    describe('Auth failures', () => {
        test('unregistered user throws UserNotRegisteredTelegramError', () => {
            const ctx = mockCallbackCtx(UNREGISTERED_TELEGRAM_ID, ['gr_create_club_700', '700']);
            expect(() => telegramGameRulesService.handleCreateClub(ctx))
                .toThrow(UserNotRegisteredTelegramError);
        });

        test('non-owner throws UserNotClubOwnerTelegramError', () => {
            const ctx = mockCallbackCtx(NON_OWNER_TELEGRAM_ID, ['gr_create_club_700', '700']);
            expect(() => telegramGameRulesService.handleCreateClub(ctx))
                .toThrow(UserNotClubOwnerTelegramError);
        });
    });

    describe('Wizard TTL expiry', () => {
        test('expired creation state returns false for text input', () => {
            const ctx1 = mockCallbackCtx(OWNER_TELEGRAM_ID, ['gr_create_club_700', '700']);
            telegramGameRulesService.handleCreateClub(ctx1);

            jest.useFakeTimers();
            jest.advanceTimersByTime(11 * 60 * 1000);

            const ctx2 = mockTextCtx(OWNER_TELEGRAM_ID, 'Late Name');
            const handled = telegramGameRulesService.handleTextInput(ctx2);
            expect(handled).toBe(false);

            jest.useRealTimers();
        });
    });
});
