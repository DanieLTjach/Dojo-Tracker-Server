import { jest } from '@jest/globals';
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

        skillRepo = new SkillRatingRepository();
        gameRepo = new GameRepository();
        regRepo = new EventRegistrationRepository();
        service = new SkillRatingService(skillRepo, undefined, undefined, gameRepo, regRepo);

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

        it('should mark track dirty when applyFinishedGame encounters an error', () => {
            const gameDate = new Date('2025-01-10T12:00:00.000Z');
            const gameId = gameRepo.createGame(EVENT_ID, 0, gameDate, null, null);
            gameRepo.addGamePlayer(gameId, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_4, 10000, 'NORTH', 0, false, 0);

            jest.spyOn(skillRepo, 'insertSkillRatingGame').mockImplementationOnce(() => {
                throw new Error('Database error during insert');
            });

            service.applyFinishedGame(gameId);
            expect(skillRepo.isTrackDirty(CLUB_ID, 4)).toBe(true);
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

        it('should recompute track when reverting a non-head game and leave track clean', () => {
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

            // Track should be clean, and resulting rating should match having only played game 2
            expect(skillRepo.isTrackDirty(CLUB_ID, 4)).toBe(false);
            const r1 = skillRepo.findSkillRating(CLUB_ID, USER_1, 4);
            expect(r1).toBeDefined();
            expect(r1!.gamesPlayed).toBe(1);

            // Delete game 1 from DB and compare with fresh from-scratch recompute to ensure exact equality
            gameRepo.deleteGamePlayersByGameId(gameId1);
            gameRepo.deleteGameById(gameId1);

            const expectedRecompute = service.recomputeTrack(CLUB_ID, 4);
            expect(expectedRecompute.gamesProcessed).toBe(1);
            const r1AfterRecompute = skillRepo.findSkillRating(CLUB_ID, USER_1, 4);
            expect(r1!.mu).toBeCloseTo(r1AfterRecompute!.mu, 6);
            expect(r1!.sigma).toBeCloseTo(r1AfterRecompute!.sigma, 6);
        });

        it('should mark track dirty when revertFinishedGame encounters an error', () => {
            const gameDate = new Date('2025-01-10T12:00:00.000Z');
            const gameId = gameRepo.createGame(EVENT_ID, 0, gameDate, null, null);
            gameRepo.addGamePlayer(gameId, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_4, 10000, 'NORTH', 0, false, 0);
            service.applyFinishedGame(gameId);

            jest.spyOn(skillRepo, 'deleteSkillRatingGamesByGameId').mockImplementationOnce(() => {
                throw new Error('Database error during delete');
            });

            service.revertFinishedGame(gameId);
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

    describe('Tie handling under DIVIDE vs WIND', () => {
        it('DIVIDE moves equal-score players symmetrically', () => {
            // Event with DIVIDE tie-break (gameRulesId 2 is DIVIDE)
            const gameDate = new Date('2025-01-10T12:00:00.000Z');
            const gameId = gameRepo.createGame(EVENT_ID, 0, gameDate, null, null);
            gameRepo.addGamePlayer(gameId, USER_1, 35000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_2, 35000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_3, 15000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_4, 15000, 'NORTH', 0, false, 0);

            service.applyFinishedGame(gameId);

            const r1 = skillRepo.findSkillRating(CLUB_ID, USER_1, 4);
            const r2 = skillRepo.findSkillRating(CLUB_ID, USER_2, 4);
            const r3 = skillRepo.findSkillRating(CLUB_ID, USER_3, 4);
            const r4 = skillRepo.findSkillRating(CLUB_ID, USER_4, 4);

            expect(r1).toBeDefined();
            expect(r2).toBeDefined();
            expect(r3).toBeDefined();
            expect(r4).toBeDefined();

            // Equal starting ratings + equal scores under DIVIDE -> exact equal mu and sigma
            expect(r1!.mu).toBeCloseTo(r2!.mu, 6);
            expect(r1!.sigma).toBeCloseTo(r2!.sigma, 6);
            expect(r3!.mu).toBeCloseTo(r4!.mu, 6);
            expect(r3!.sigma).toBeCloseTo(r4!.sigma, 6);

            // Audit rows check: ranks are [1, 1, 3, 3]
            const auditRows = skillRepo.findSkillRatingGamesByGameId(gameId);
            expect(auditRows.find(r => r.userId === USER_1)?.rank).toBe(1);
            expect(auditRows.find(r => r.userId === USER_2)?.rank).toBe(1);
            expect(auditRows.find(r => r.userId === USER_3)?.rank).toBe(3);
            expect(auditRows.find(r => r.userId === USER_4)?.rank).toBe(3);
        });

        it('WIND breaks point ties by startPlace order (EAST < SOUTH < WEST < NORTH)', () => {
            // Create event with WIND tie-break (gameRulesId 5 has umaTieBreak = 'WIND')
            const windEventId = 2050;
            createCustomEvent(
                windEventId,
                'Wind Event',
                '2025-01-01T00:00:00.000Z',
                '2025-12-31T23:59:59.000Z',
                5,
                CLUB_ID
            );

            const gameDate = new Date('2025-01-10T12:00:00.000Z');
            const gameId = gameRepo.createGame(windEventId, 0, gameDate, null, null);
            gameRepo.addGamePlayer(gameId, USER_1, 35000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_2, 35000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_3, 15000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(gameId, USER_4, 15000, 'NORTH', 0, false, 0);

            service.applyFinishedGame(gameId);

            const r1 = skillRepo.findSkillRating(CLUB_ID, USER_1, 4);
            const r2 = skillRepo.findSkillRating(CLUB_ID, USER_2, 4);
            const r3 = skillRepo.findSkillRating(CLUB_ID, USER_3, 4);
            const r4 = skillRepo.findSkillRating(CLUB_ID, USER_4, 4);

            // Under WIND, USER_1 (EAST) beats USER_2 (SOUTH)
            expect(r1!.mu).toBeGreaterThan(r2!.mu);
            // USER_3 (WEST) beats USER_4 (NORTH)
            expect(r3!.mu).toBeGreaterThan(r4!.mu);

            // Audit rows check: ranks are [1, 2, 3, 4]
            const auditRows = skillRepo.findSkillRatingGamesByGameId(gameId);
            expect(auditRows.find(r => r.userId === USER_1)?.rank).toBe(1);
            expect(auditRows.find(r => r.userId === USER_2)?.rank).toBe(2);
            expect(auditRows.find(r => r.userId === USER_3)?.rank).toBe(3);
            expect(auditRows.find(r => r.userId === USER_4)?.rank).toBe(4);
        });
    });

    describe('Sanma (3-player) vs Yonma (4-player) isolation', () => {
        it('tracks 3p and 4p games completely independently in the same club', () => {
            const sanmaEventId = 2060;
            // gameRulesId 3 has numberOfPlayers = 3
            createCustomEvent(
                sanmaEventId,
                'Sanma Event',
                '2025-01-01T00:00:00.000Z',
                '2025-12-31T23:59:59.000Z',
                3,
                CLUB_ID
            );

            // Play a 3-player game
            const g3p = gameRepo.createGame(sanmaEventId, 0, new Date('2025-01-10T12:00:00.000Z'), null, null);
            gameRepo.addGamePlayer(g3p, USER_1, 45000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(g3p, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(g3p, USER_3, 25000, 'WEST', 0, false, 0);
            service.applyFinishedGame(g3p);

            // User 1 has 3p rating, but NO 4p rating yet
            const r1_3p = skillRepo.findSkillRating(CLUB_ID, USER_1, 3);
            const r1_4p = skillRepo.findSkillRating(CLUB_ID, USER_1, 4);
            expect(r1_3p).toBeDefined();
            expect(r1_3p!.gamesPlayed).toBe(1);
            expect(r1_3p!.mu).toBeGreaterThan(25);
            expect(r1_4p).toBeUndefined();

            // Now play a 4-player game where USER_1 loses (4th place)
            const g4p = gameRepo.createGame(EVENT_ID, 0, new Date('2025-01-11T12:00:00.000Z'), null, null);
            gameRepo.addGamePlayer(g4p, USER_2, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(g4p, USER_3, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(g4p, USER_4, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(g4p, USER_1, 10000, 'NORTH', 0, false, 0);
            service.applyFinishedGame(g4p);

            // Check 4p rating: 1 game played, mu < 25
            const r1_4p_after = skillRepo.findSkillRating(CLUB_ID, USER_1, 4);
            expect(r1_4p_after).toBeDefined();
            expect(r1_4p_after!.gamesPlayed).toBe(1);
            expect(r1_4p_after!.mu).toBeLessThan(25);

            // 3p rating must remain untouched
            const r1_3p_after = skillRepo.findSkillRating(CLUB_ID, USER_1, 3);
            expect(r1_3p_after!.gamesPlayed).toBe(1);
            expect(r1_3p_after!.mu).toBeCloseTo(r1_3p!.mu, 6);
            expect(r1_3p_after!.sigma).toBeCloseTo(r1_3p!.sigma, 6);
        });
    });

    describe('Inactivity decay & resolution consistency', () => {
        it('inflates sigma lazily after grace period without altering mu in DB', () => {
            const gameDate = new Date('2025-01-01T12:00:00.000Z');
            const g1 = gameRepo.createGame(EVENT_ID, 0, gameDate, null, null);
            gameRepo.addGamePlayer(g1, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(g1, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(g1, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(g1, USER_4, 10000, 'NORTH', 0, false, 0);
            service.applyFinishedGame(g1);

            // Inside grace period: 10 days later
            const insideGrace = new Date('2025-01-11T12:00:00.000Z');
            const profileGrace = service.getUserSkillAcrossClubs(USER_1, insideGrace);
            const trackGrace = profileGrace.clubs[0]!.tracks[0]!;
            expect(trackGrace.effectiveSigma).toBe(trackGrace.sigma);
            expect(trackGrace.daysSinceLastGame).toBe(10);

            // 400 days later: inactiveDays = 400 - 30 = 370 days
            const longAfter = new Date('2026-02-05T12:00:00.000Z');
            const profileDecayed = service.getUserSkillAcrossClubs(USER_1, longAfter);
            const trackDecayed = profileDecayed.clubs[0]!.tracks[0]!;

            expect(trackDecayed.daysSinceLastGame).toBe(400);
            expect(trackDecayed.effectiveSigma).toBeGreaterThan(trackDecayed.sigma);
            expect(trackDecayed.effectiveSigma).toBeLessThanOrEqual(25 / 3);
            expect(trackDecayed.mu).toBe(trackGrace.mu); // mu is untouched
            expect(trackDecayed.skill).toBeLessThan(trackGrace.skill); // conservative skill dropped

            // DB row itself must remain unchanged
            const rawDb = skillRepo.findSkillRating(CLUB_ID, USER_1, 4);
            expect(rawDb!.sigma).toBe(trackGrace.sigma);
            expect(rawDb!.mu).toBe(trackGrace.mu);

            // Profile and Leaderboard must report identical skill and effectiveSigma at that same timestamp
            const leaderboard = service.getClubLeaderboard(CLUB_ID, 4, longAfter);
            const lbEntry = leaderboard.provisionalEntries.find(e => e.userId === USER_1);
            expect(lbEntry).toBeDefined();
            expect(lbEntry!.skill).toBe(trackDecayed.skill);
            expect(lbEntry!.effectiveSigma).toBe(trackDecayed.effectiveSigma);
            expect(lbEntry!.mu).toBe(trackDecayed.mu);
        });
    });

    describe('Provisional status & threshold changes', () => {
        it('promotes players immediately when provisionalGameThreshold is lowered', () => {
            const g1 = gameRepo.createGame(EVENT_ID, 0, new Date('2025-01-10T12:00:00.000Z'), null, null);
            gameRepo.addGamePlayer(g1, USER_1, 40000, 'EAST', 0, false, 0);
            gameRepo.addGamePlayer(g1, USER_2, 30000, 'SOUTH', 0, false, 0);
            gameRepo.addGamePlayer(g1, USER_3, 20000, 'WEST', 0, false, 0);
            gameRepo.addGamePlayer(g1, USER_4, 10000, 'NORTH', 0, false, 0);
            service.applyFinishedGame(g1);

            // Default threshold is 30 -> player has 1 game -> isProvisional: true
            const lbDefault = service.getClubLeaderboard(CLUB_ID, 4);
            expect(lbDefault.entries).toHaveLength(0);
            expect(lbDefault.provisionalEntries).toHaveLength(4);
            expect(lbDefault.provisionalEntries[0]!.isProvisional).toBe(true);
            expect(lbDefault.provisionalEntries[0]!.gamesUntilRanked).toBe(29);

            // Update threshold to 1 -> player is now ranked
            service.updateConfig(CLUB_ID, 1, true, 0);
            const lbUpdated = service.getClubLeaderboard(CLUB_ID, 4);
            expect(lbUpdated.entries).toHaveLength(4);
            expect(lbUpdated.provisionalEntries).toHaveLength(0);
            expect(lbUpdated.entries[0]!.isProvisional).toBe(false);
            expect(lbUpdated.entries[0]!.gamesUntilRanked).toBe(0);
        });
    });
});
