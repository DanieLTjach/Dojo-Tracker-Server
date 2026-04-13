import { GameRulesRepository, type InsertGameRulesParams } from '../src/repository/GameRulesRepository.ts';
import { EventRepository } from '../src/repository/EventRepository.ts';
import { GameRulesService } from '../src/service/GameRulesService.ts';
import { CannotDeleteGameRulesInUseError } from '../src/error/EventErrors.ts';
import { InsufficientClubPermissionsError } from '../src/error/ClubErrors.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';

const TEST_CLUB_ID = 800;
const ADMIN_USER_ID = 0;

const baseParams: InsertGameRulesParams = {
    name: 'CRUD Test Rules',
    numberOfPlayers: 4,
    uma: '15,5,-5,-15',
    startingPoints: 25000,
    chomboPointsAfterUma: null,
    umaTieBreak: 'DIVIDE',
    clubId: TEST_CLUB_ID
};

describe('Game Rules CRUD', () => {
    const repo = new GameRulesRepository();
    const eventRepo = new EventRepository();
    const service = new GameRulesService();
    const timestamp = '2026-01-01T00:00:00.000Z';

    let createdRuleId: number;

    beforeAll(() => {
        dbManager.db.prepare(
            `INSERT INTO club (id, name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(TEST_CLUB_ID, 'CRUD Test Club', null, null, null, null, 1, timestamp, timestamp, 0);
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM gameRules WHERE clubId = ?').run(TEST_CLUB_ID);
        dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(TEST_CLUB_ID);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('GameRulesRepository', () => {
        test('insertGameRules returns new id and round-trips via findGameRulesById', () => {
            const id = repo.insertGameRules(baseParams);
            createdRuleId = id;

            expect(id).toBeGreaterThan(0);

            const fetched = repo.findGameRulesById(id);
            expect(fetched).toBeDefined();
            expect(fetched!.name).toBe(baseParams.name);
            expect(fetched!.numberOfPlayers).toBe(4);
            expect(fetched!.startingPoints).toBe(25000);
            expect(fetched!.umaTieBreak).toBe('DIVIDE');
            expect(fetched!.clubId).toBe(TEST_CLUB_ID);
            expect(fetched!.chomboPointsAfterUma).toBeNull();
        });

        test('updateGameRules changes all fields', () => {
            const updatedParams: InsertGameRulesParams = {
                name: 'Updated Rules',
                numberOfPlayers: 3,
                uma: '15,0,-15',
                startingPoints: 30000,
                chomboPointsAfterUma: 20000,
                umaTieBreak: 'WIND',
                clubId: TEST_CLUB_ID
            };

            repo.updateGameRules(createdRuleId, updatedParams);
            const fetched = repo.findGameRulesById(createdRuleId);

            expect(fetched!.name).toBe('Updated Rules');
            expect(fetched!.numberOfPlayers).toBe(3);
            expect(fetched!.startingPoints).toBe(30000);
            expect(fetched!.chomboPointsAfterUma).toBe(20000);
            expect(fetched!.umaTieBreak).toBe('WIND');
        });

        test('deleteGameRules removes the record', () => {
            const id = repo.insertGameRules({ ...baseParams, name: 'To Delete' });
            expect(repo.findGameRulesById(id)).toBeDefined();

            repo.deleteGameRules(id);
            expect(repo.findGameRulesById(id)).toBeUndefined();
        });
    });

    describe('EventRepository.countEventsByGameRulesId', () => {
        test('returns 0 when no events reference the rule', () => {
            const count = eventRepo.countEventsByGameRulesId(createdRuleId);
            expect(count).toBe(0);
        });

        test('returns correct count when events reference the rule', () => {
            const eventId = 8001;
            dbManager.db.prepare(
                `INSERT INTO event (id, name, type, gameRules, clubId, startingRating, minimumGamesForRating, modifiedBy, createdAt, modifiedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(eventId, 'Count Test Event', 'SEASON', createdRuleId, TEST_CLUB_ID, 0, 0, 0, timestamp, timestamp);

            expect(eventRepo.countEventsByGameRulesId(createdRuleId)).toBe(1);

            dbManager.db.prepare('DELETE FROM event WHERE id = ?').run(eventId);
        });
    });

    describe('GameRulesService', () => {
        test('createGameRules creates and returns complete record', () => {
            const created = service.createGameRules({
                ...baseParams,
                name: 'Service Create Test'
            }, ADMIN_USER_ID);

            expect(created.id).toBeGreaterThan(0);
            expect(created.name).toBe('Service Create Test');
            expect(created.numberOfPlayers).toBe(4);

            repo.deleteGameRules(created.id);
        });

        test('updateGameRules updates and returns updated record', () => {
            const result = service.updateGameRules(createdRuleId, {
                ...baseParams,
                name: 'Service Update Test',
                startingPoints: 35000
            }, ADMIN_USER_ID);

            expect(result.name).toBe('Service Update Test');
            expect(result.startingPoints).toBe(35000);
        });

        test('deleteGameRules succeeds when no events reference it', () => {
            const toDelete = service.createGameRules({
                ...baseParams,
                name: 'Service Delete Test'
            }, ADMIN_USER_ID);

            service.deleteGameRules(toDelete.id, ADMIN_USER_ID);
            expect(repo.findGameRulesById(toDelete.id)).toBeUndefined();
        });

        test('deleteGameRules throws CannotDeleteGameRulesInUseError when events reference it', () => {
            const ruleId = repo.insertGameRules({ ...baseParams, name: 'Referenced Rule' });
            const eventId = 8002;
            dbManager.db.prepare(
                `INSERT INTO event (id, name, type, gameRules, clubId, startingRating, minimumGamesForRating, modifiedBy, createdAt, modifiedAt)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(eventId, 'FK Block Test', 'SEASON', ruleId, TEST_CLUB_ID, 0, 0, 0, timestamp, timestamp);

            expect(() => service.deleteGameRules(ruleId, ADMIN_USER_ID))
                .toThrow(CannotDeleteGameRulesInUseError);

            dbManager.db.prepare('DELETE FROM event WHERE id = ?').run(eventId);
            repo.deleteGameRules(ruleId);
        });

        test('createGameRules with non-owner non-admin throws InsufficientClubPermissionsError', () => {
            const nonOwnerUserId = 999;
            dbManager.db.prepare(
                `INSERT OR IGNORE INTO user (id, telegramId, name, isActive, isAdmin, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(nonOwnerUserId, 999999, 'nonowner', 1, 0, timestamp, timestamp, 0);

            expect(() => service.createGameRules(baseParams, nonOwnerUserId))
                .toThrow(InsufficientClubPermissionsError);

            dbManager.db.prepare('DELETE FROM user WHERE id = ?').run(nonOwnerUserId);
        });
    });
});
