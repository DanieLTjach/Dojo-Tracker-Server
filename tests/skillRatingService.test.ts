import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { createCustomEvent } from './testHelpers.ts';
import { SkillRatingService } from '../src/service/SkillRatingService.ts';
import { SkillRatingRepository } from '../src/repository/SkillRatingRepository.ts';
import { GameRepository } from '../src/repository/GameRepository.ts';
import { EventRegistrationRepository } from '../src/repository/EventRegistrationRepository.ts';
import { InvalidGameSizeError, SkillRatingNotEnabledForClubError } from '../src/error/SkillErrors.ts';

describe('SkillRatingService', () => {
    let service: SkillRatingService;
    let skillRepo: SkillRatingRepository;
    let gameRepo: GameRepository;
    let regRepo: EventRegistrationRepository;

    const CLUB_ID = 1;
    const EVENT_ID = 2000;
    const USER_1 = 101;
    const USER_2 = 102;
    const USER_3 = 103;
    const USER_4 = 104;
    const USER_FILLER = 105;

    beforeEach(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
        dbManager.reinitDB();

        service = new SkillRatingService();
        skillRepo = new SkillRatingRepository();
        gameRepo = new GameRepository();
        regRepo = new EventRegistrationRepository();

        // Create users
        const now = '2025-01-01T00:00:00.000Z';
        for (
            const [id, name] of [
                [USER_1, 'Alice'],
                [USER_2, 'Bob'],
                [USER_3, 'Charlie'],
                [USER_4, 'David'],
                [USER_FILLER, 'Filler'],
            ] as const
        ) {
            dbManager.db.prepare(
                `INSERT INTO user (id, name, isAdmin, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, 0, 'ACTIVE', ?, ?, 0)`
            ).run(id, name, now, now);
        }

        // Create club 1 if not exists
        dbManager.db.prepare(
            `INSERT OR IGNORE INTO club (id, name, isActive, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Main Club', 1, ?, ?, 0)`
        ).run(CLUB_ID, now, now);

        // Create event
        createCustomEvent(EVENT_ID, 'Skill Event', '2025-01-01T00:00:00.000Z', '2025-12-31T23:59:59.000Z', 2, CLUB_ID);
    });

    afterAll(() => {
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    describe('applyFinishedGame', () => {
        it('should update mu and sigma for 4 players in a finished game', () => {
            const gameDate = new Date('2025-01-10T12:00:00.000Z');
            const gameId = gameRepo.createGame(EVENT_ID, 0, gameDate, null, null);
            gameRepo.addGamePlayer(gameId, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_4, 10000, 'NORTH', 0, false, 0);

            service.applyFinishedGame(gameId);

            const r1 = skillRepo.findSkillRating(CLUB_ID, USER_1, 4);
            const r2 = skillRepo.findSkillRating(CLUB_ID, USER_2, 4);
            const r3 = skillRepo.findSkillRating(CLUB_ID, USER_3, 4);
            const r4 = skillRepo.findSkillRating(CLUB_ID, USER_4, 4);

            expect(r1).toBeDefined();
            expect(r1!.mu).toBeGreaterThan(25);
            expect(r1!.sigma).toBeLessThan(25 / 3);
            expect(r1!.gamesPlayed).toBe(1);

            expect(r2).toBeDefined();
            expect(r3).toBeDefined();

            expect(r4).toBeDefined();
            expect(r4!.mu).toBeLessThan(25);

            // Check audit rows
            const auditRows = skillRepo.findSkillRatingGamesByGameId(gameId);
            expect(auditRows).toHaveLength(4);
            expect(auditRows.find(r => r.userId === USER_1)?.rank).toBe(1);
            expect(auditRows.find(r => r.userId === USER_4)?.rank).toBe(4);
        });

        it('should exclude filler players from rating update', () => {
            // Register USER_FILLER as filler
            regRepo.createRegistration({
                eventId: EVENT_ID,
                userId: USER_FILLER,
                status: 'APPROVED',
                isFillerPlayer: true,
                createdAt: new Date(),
                modifiedAt: new Date(),
                modifiedBy: 0,
            });

            const gameDate = new Date('2025-01-10T12:00:00.000Z');
            const gameId = gameRepo.createGame(EVENT_ID, 0, gameDate, null, null);
            gameRepo.addGamePlayer(gameId, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_FILLER, 10000, 'NORTH', 0, false, 0);

            service.applyFinishedGame(gameId);

            const rFiller = skillRepo.findSkillRating(CLUB_ID, USER_FILLER, 4);
            expect(rFiller).toBeUndefined();

            const r1 = skillRepo.findSkillRating(CLUB_ID, USER_1, 4);
            expect(r1).toBeDefined();
        });

        it('should be idempotent if called twice for same game', () => {
            const gameDate = new Date('2025-01-10T12:00:00.000Z');
            const gameId = gameRepo.createGame(EVENT_ID, 0, gameDate, null, null);
            gameRepo.addGamePlayer(gameId, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_4, 10000, 'NORTH', 0, false, 0);

            service.applyFinishedGame(gameId);
            const r1First = skillRepo.findSkillRating(CLUB_ID, USER_1, 4);

            service.applyFinishedGame(gameId);
            const r1Second = skillRepo.findSkillRating(CLUB_ID, USER_1, 4);

            expect(r1Second!.mu).toBeCloseTo(r1First!.mu, 5);
            expect(r1Second!.sigma).toBeCloseTo(r1First!.sigma, 5);
            expect(r1Second!.gamesPlayed).toBe(1);
        });
    });

    describe('revertFinishedGame', () => {
        it('should restore previous rating when reverting newest game', () => {
            const gameDate1 = new Date('2025-01-10T12:00:00.000Z');
            const gameId1 = gameRepo.createGame(EVENT_ID, 0, gameDate1, null, null);
            gameRepo.addGamePlayer(gameId1, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(gameId1, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(gameId1, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(gameId1, USER_4, 10000, 'NORTH', 0, false, 0);
            service.applyFinishedGame(gameId1);

            const gameDate2 = new Date('2025-01-11T12:00:00.000Z');
            const gameId2 = gameRepo.createGame(EVENT_ID, 0, gameDate2, null, null);
            gameRepo.addGamePlayer(gameId2, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(gameId2, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(gameId2, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(gameId2, USER_4, 10000, 'NORTH', 0, false, 0);
            service.applyFinishedGame(gameId2);

            const r1AfterTwo = skillRepo.findSkillRating(CLUB_ID, USER_1, 4);
            expect(r1AfterTwo!.gamesPlayed).toBe(2);

            service.revertFinishedGame(gameId2);

            const r1AfterRevert = skillRepo.findSkillRating(CLUB_ID, USER_1, 4);
            expect(r1AfterRevert!.gamesPlayed).toBe(1);
            expect(skillRepo.isTrackDirty(CLUB_ID, 4)).toBe(false);
        });

        it('should mark track dirty when reverting a non-head game', () => {
            const gameDate1 = new Date('2025-01-10T12:00:00.000Z');
            const gameId1 = gameRepo.createGame(EVENT_ID, 0, gameDate1, null, null);
            gameRepo.addGamePlayer(gameId1, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(gameId1, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(gameId1, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(gameId1, USER_4, 10000, 'NORTH', 0, false, 0);
            service.applyFinishedGame(gameId1);

            const gameDate2 = new Date('2025-01-11T12:00:00.000Z');
            const gameId2 = gameRepo.createGame(EVENT_ID, 0, gameDate2, null, null);
            gameRepo.addGamePlayer(gameId2, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(gameId2, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(gameId2, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(gameId2, USER_4, 10000, 'NORTH', 0, false, 0);
            service.applyFinishedGame(gameId2);

            // Revert game 1 (older)
            service.revertFinishedGame(gameId1);

            expect(skillRepo.isTrackDirty(CLUB_ID, 4)).toBe(true);
        });
    });

    describe('recomputeTrack', () => {
        it('should reconstruct ratings from history and clear dirty flag', () => {
            const gameDate1 = new Date('2025-01-10T12:00:00.000Z');
            const gameId1 = gameRepo.createGame(EVENT_ID, 0, gameDate1, null, null);
            gameRepo.addGamePlayer(gameId1, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(gameId1, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(gameId1, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(gameId1, USER_4, 10000, 'NORTH', 0, false, 0);
            service.applyFinishedGame(gameId1);

            // Mark dirty manually
            skillRepo.markTrackDirty(CLUB_ID, 4, 'Test dirty');
            expect(skillRepo.isTrackDirty(CLUB_ID, 4)).toBe(true);

            const result = service.recomputeTrack(CLUB_ID, 4);
            expect(result.gamesProcessed).toBe(1);
            expect(result.playersAffected).toBe(4);
            expect(skillRepo.isTrackDirty(CLUB_ID, 4)).toBe(false);

            const r1 = skillRepo.findSkillRating(CLUB_ID, USER_1, 4);
            expect(r1).toBeDefined();
            expect(r1!.gamesPlayed).toBe(1);
        });
    });

    describe('getClubLeaderboard', () => {
        it('should separate ranked and provisional players and compute places', () => {
            // Set threshold to 2
            service.updateConfig(CLUB_ID, 2, true, 0);

            // Game 1: Alice 1st, Bob 2nd, Charlie 3rd, David 4th
            const g1 = gameRepo.createGame(EVENT_ID, 0, new Date('2025-01-10T12:00:00.000Z'), null, null);
            gameRepo.addGamePlayer(g1, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(g1, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(g1, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(g1, USER_4, 10000, 'NORTH', 0, false, 0);
            service.applyFinishedGame(g1);

            // Game 2: Alice 1st, Bob 2nd, Charlie 3rd, David 4th (now all have 2 games)
            const g2 = gameRepo.createGame(EVENT_ID, 0, new Date('2025-01-11T12:00:00.000Z'), null, null);
            gameRepo.addGamePlayer(g2, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(g2, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(g2, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(g2, USER_4, 10000, 'NORTH', 0, false, 0);
            service.applyFinishedGame(g2);

            const lb = service.getClubLeaderboard(CLUB_ID, 4, new Date('2025-01-12T12:00:00.000Z'));
            expect(lb.entries).toHaveLength(4);
            expect(lb.provisionalEntries).toHaveLength(0);
            expect(lb.entries[0]!.userId).toBe(USER_1);
            expect(lb.entries[0]!.place).toBe(1);
        });

        it('should throw if skill rating is disabled for club', () => {
            service.updateConfig(CLUB_ID, 30, false, 0);
            expect(() => service.getClubLeaderboard(CLUB_ID, 4)).toThrow(SkillRatingNotEnabledForClubError);
        });

        it('should throw on invalid gameSize', () => {
            expect(() => service.getClubLeaderboard(CLUB_ID, 5)).toThrow(InvalidGameSizeError);
        });
    });

    describe('getUserSkillAcrossClubs', () => {
        it('should return profile across clubs and determine primaryClubId', () => {
            const g1 = gameRepo.createGame(EVENT_ID, 0, new Date('2025-01-10T12:00:00.000Z'), null, null);
            gameRepo.addGamePlayer(g1, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(g1, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(g1, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(g1, USER_4, 10000, 'NORTH', 0, false, 0);
            service.applyFinishedGame(g1);

            const profile = service.getUserSkillAcrossClubs(USER_1, new Date('2025-01-12T12:00:00.000Z'));
            expect(profile.userId).toBe(USER_1);
            expect(profile.primaryClubId).toBe(CLUB_ID);
            expect(profile.clubs).toHaveLength(1);
            expect(profile.clubs[0]!.tracks).toHaveLength(1);
            expect(profile.clubs[0]!.tracks[0]!.gameSize).toBe(4);
        });
    });
});
