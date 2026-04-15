import { jest, describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import telegramGameRulesService, { buildBaseDetails, buildDiffSummary } from '../src/service/TelegramGameRulesService.ts';
import { GameRulesRepository } from '../src/repository/GameRulesRepository.ts';
import { CannotUpdateGameRulesInUseTelegramError, UserNotClubOwnerTelegramError, UserNotRegisteredTelegramError } from '../src/error/TelegramErrors.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import LogService from '../src/service/LogService.ts';
import TelegramMessageService from '../src/service/TelegramMessageService.ts';
import { TelegramTopicType } from '../src/model/TelegramTopic.ts';
import type { GameRulesDetails } from '../src/model/EventModels.ts';

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

function mockDocumentCtx(telegramId: number, fileText: string): any {
    const replies: any[] = [];
    jest.spyOn(global, 'fetch').mockResolvedValue({
        text: async () => fileText
    } as Response);

    return {
        from: { id: telegramId },
        message: {
            document: {
                file_name: 'rules.json',
                file_id: 'test-file-id'
            }
        },
        telegram: {
            getFileLink: jest.fn(async () => new URL('https://example.test/rules.json'))
        },
        reply: jest.fn((...args: any[]) => { replies.push(args); }),
        replyWithHTML: jest.fn((...args: any[]) => { replies.push(args); }),
        _replies: replies,
    };
}

function baseRules(details: GameRulesDetails) {
    return details.rules;
}

function sampleDetails(ruleName = 'Кількість гравців', value = '4'): GameRulesDetails {
    const key = ruleName === 'Старе правило'
        ? 'open_tanyao'
        : ruleName === 'Нове правило'
            ? 'after_attaching'
            : 'number_of_players';
    const normalizedValue = value === '4' ? 4 : value === 'old' ? false : value === 'new' ? true : value;
    return {
        links: [{ url: 'https://example.test/rules', label: { uk: 'Rules' } }],
        rules: {
            number_of_players: 4,
            starting_points: 30000,
            [key]: normalizedValue
        }
    };
}

function sampleV1Details() {
    return {
        links: [{ url: 'https://example.test/rules', label: 'Rules' }],
        rules: [
            {
                rule: 'Кількість гравців',
                value: '4',
                tooltip: { label: 'Кількість гравців', content: 'Flat tooltip text' }
            }
        ]
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
        dbManager.db.prepare('DELETE FROM clubTelegramTopics WHERE clubId = ?').run(TEST_CLUB_ID);
        dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ?').run(TEST_CLUB_ID);
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?)').run(OWNER_USER_ID, NON_OWNER_USER_ID);
        dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(TEST_CLUB_ID);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    afterEach(() => {
        jest.restoreAllMocks();
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

            const rules = baseRules(result);
            expect(rules['number_of_players']).toBe(4);
            expect(rules['starting_points']).toBe(25000);
            expect(rules['uma']).toEqual([15, 5, -5, -15]);
            expect(rules['uma_tie_break']).toBe('by_wind');
            expect(rules['chombo']).toBe('twenty_thousand_after_uma');
        });

        test('3-player without chombo', () => {
            const result = buildBaseDetails({
                numberOfPlayers: 3,
                startingPoints: 0,
                umaLabel: '15 / 0 / -15',
                umaTieBreak: 'DIVIDE',
                chomboPointsAfterUma: null,
            });

            const rules = baseRules(result);
            expect(rules['number_of_players']).toBe(3);
            expect(rules['starting_points']).toBe(0);
            expect(rules['uma_tie_break']).toBe('equal_split');
            expect(rules['chombo']).toBeUndefined();
        });

        test('has empty optional collections by default', () => {
            const result = buildBaseDetails({
                numberOfPlayers: 4,
                startingPoints: 30000,
                umaLabel: '15 / 5 / -5 / -15',
                umaTieBreak: 'WIND',
                chomboPointsAfterUma: null,
            });
            expect(result.links).toEqual([]);
            expect(result.clubRules).toEqual([]);
        });
    });

    describe('Create wizard — full happy path', () => {
        test('creates game rules with auto-generated details', () => {
            const logSpy = jest.spyOn(LogService, 'logInfo');
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
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Game Rules Created'), null);

            // Verify DB
            const allRules = repo.findAllGameRules();
            const created = allRules.find(r => r.name === 'Wizard Test Rules');
            expect(created).toBeDefined();
            expect(created!.numberOfPlayers).toBe(4);
            expect(created!.startingPoints).toBe(25000);
            expect(created!.details).not.toBeNull();
            expect(Object.keys(baseRules(created!.details!))).toHaveLength(5);
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
            const logSpy = jest.spyOn(LogService, 'logInfo');
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
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Game Rules Updated'), null);

            const updated = repo.findGameRulesById(editRuleId);
            expect(updated!.name).toBe('Edited Rules Name');
            expect(updated!.numberOfPlayers).toBe(3);
            expect(updated!.startingPoints).toBe(0);
            expect(updated!.details).not.toBeNull();
            expect(baseRules(updated!.details!)['chombo']).toBeUndefined();
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
            const logSpy = jest.spyOn(LogService, 'logInfo');
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
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Game Rules Deleted'), null);

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

    describe('Details upload flow', () => {
        let detailsRuleId: number;

        beforeAll(() => {
            detailsRuleId = repo.insertGameRules({
                name: 'Details Upload Rules',
                numberOfPlayers: 4,
                uma: '15,5,-5,-15',
                startingPoints: 25000,
                chomboPointsAfterUma: null,
                umaTieBreak: 'DIVIDE',
                clubId: TEST_CLUB_ID
            });
            repo.updateGameRulesDetails(detailsRuleId, sampleDetails('Старе правило', 'old'));
        });

        test('accepts V2 upload and logs old and new JSON attachments on confirm', async () => {
            const topic = { type: TelegramTopicType.CLUB_LOGS, chatId: -100700, topicId: 123 };
            dbManager.db.prepare(
                `INSERT INTO clubTelegramTopics (clubId, rating, userLogs, gameLogs, clubLogs, main, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(clubId) DO UPDATE SET clubLogs = excluded.clubLogs`
            ).run(TEST_CLUB_ID, null, null, null, JSON.stringify(topic), null, timestamp, timestamp, 0);

            const newDetails = sampleDetails('Нове правило', 'new');
            const selectCtx = mockCallbackCtx(OWNER_TELEGRAM_ID, [`gr_details_${detailsRuleId}`, String(detailsRuleId)]);
            await telegramGameRulesService.handleDetailsRules(selectCtx);

            const uploadCtx = mockDocumentCtx(OWNER_TELEGRAM_ID, JSON.stringify(newDetails));
            await telegramGameRulesService.handleDocumentUpload(uploadCtx);
            expect(uploadCtx.replyWithHTML).toHaveBeenCalledWith(
                expect.stringContaining('after_attaching'),
                expect.any(Object)
            );

            const sendDocumentSpy = jest.spyOn(TelegramMessageService, 'sendDocument').mockResolvedValue();
            const confirmCtx = mockCallbackCtx(OWNER_TELEGRAM_ID, [`gr_confirm_${detailsRuleId}`, String(detailsRuleId)]);
            await telegramGameRulesService.handleConfirm(confirmCtx);

            expect(confirmCtx.reply).toHaveBeenCalledWith('✅ Деталі збережено!');
            expect(sendDocumentSpy).toHaveBeenCalledTimes(2);
            expect(sendDocumentSpy.mock.calls[0]![2]).toContain(`rules-${detailsRuleId}-old-`);
            expect(sendDocumentSpy.mock.calls[1]![2]).toContain(`rules-${detailsRuleId}-new-`);
            expect(repo.findGameRulesById(detailsRuleId)!.details).toEqual(newDetails);
        });

        test('rejects V1 upload with validation errors', async () => {
            const selectCtx = mockCallbackCtx(OWNER_TELEGRAM_ID, [`gr_details_${detailsRuleId}`, String(detailsRuleId)]);
            await telegramGameRulesService.handleDetailsRules(selectCtx);

            const uploadCtx = mockDocumentCtx(OWNER_TELEGRAM_ID, JSON.stringify(sampleV1Details()));
            await telegramGameRulesService.handleDocumentUpload(uploadCtx);

            expect(uploadCtx.replyWithHTML).toHaveBeenCalledWith(expect.stringContaining('Помилки валідації'));
            expect(uploadCtx.replyWithHTML.mock.calls[0]![0]).toContain('rules');
        });
    });

    describe('buildDiffSummary', () => {
        test('reports rule, link, and club rule changes', () => {
            const oldDetails = sampleDetails('Старе правило', 'old');
            const newDetails: GameRulesDetails = {
                links: [{ url: 'https://example.test/new', label: { uk: 'New rules' } }],
                rules: {
                    number_of_players: 4,
                    starting_points: 30000,
                    open_tanyao: true,
                    after_attaching: true
                },
                clubRules: [
                    {
                        key: 'house_yaku_tanuki',
                        category: 'yaku',
                        value: 1,
                        name: { uk: 'Танукі' }
                    }
                ]
            };

            const summary = buildDiffSummary(oldDetails, newDetails);

            expect(summary).toContain('📋 Правила');
            expect(summary).toContain('open_tanyao');
            expect(summary).toContain('after_attaching');
            expect(summary).toContain('New rules');
            expect(summary).toContain('house_yaku_tanuki');
        });
    });
});
