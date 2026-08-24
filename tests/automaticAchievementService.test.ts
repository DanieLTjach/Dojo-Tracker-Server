import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { TrackedGameService } from '../src/service/TrackedGameService.ts';
import { AutomaticAchievementRepository } from '../src/repository/AutomaticAchievementRepository.ts';
import { GameStatus, Wind } from '../src/model/GameModels.ts';

const SYSTEM_USER_ID = 0;

describe('AutomaticAchievementService integration', () => {
    const achievementRepository = new AutomaticAchievementRepository();
    const trackedGameService = new TrackedGameService();

    let userId: number;

    beforeAll(() => {
        const res = dbManager.db.prepare(`
            INSERT INTO user (name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
            VALUES ('AutoUser', 'autouser', 99887711, datetime('now'), datetime('now'), 0, 1, 0, 'ACTIVE')
            RETURNING id
        `).get() as { id: number };
        userId = res.id;

        dbManager.db.prepare(`
            INSERT INTO user (id, name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
            VALUES (102, 'P2', 'p2', 99887712, datetime('now'), datetime('now'), 0, 1, 0, 'ACTIVE'),
                   (103, 'P3', 'p3', 99887713, datetime('now'), datetime('now'), 0, 1, 0, 'ACTIVE'),
                   (104, 'P4', 'p4', 99887714, datetime('now'), datetime('now'), 0, 1, 0, 'ACTIVE')
        `).run();
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM automaticAchievementState WHERE userId IN (?, 102, 103, 104)').run(userId);
        dbManager.db.prepare('DELETE FROM userRatingChange WHERE userId IN (?, 102, 103, 104)').run(userId);
        dbManager.db.prepare('DELETE FROM skillRatingGame WHERE userId IN (?, 102, 103, 104)').run(userId);
        dbManager.db.prepare('DELETE FROM gameRound WHERE gameId IN (SELECT gameId FROM userToGame WHERE userId = ?)')
            .run(userId);
        const gameIds = (dbManager.db.prepare('SELECT gameId FROM userToGame WHERE userId = ?').all(userId) as any[])
            .map(r => r.gameId);
        dbManager.db.prepare('DELETE FROM userToGame WHERE userId IN (?, 102, 103, 104)').run(userId);
        if (gameIds.length > 0) {
            dbManager.db.prepare(`DELETE FROM game WHERE id IN (${gameIds.join(',')})`).run();
        }
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, 102, 103, 104)').run(userId);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    it('recomputes states for user after finished games and retracts on deletion', () => {
        const players = [
            { userId, startPlace: Wind.EAST },
            { userId: 102, startPlace: Wind.SOUTH },
            { userId: 103, startPlace: Wind.WEST },
            { userId: 104, startPlace: Wind.NORTH },
        ];

        const game = trackedGameService.createTrackedGame(1, players, SYSTEM_USER_ID, GameStatus.IN_PROGRESS);
        trackedGameService.setEnterHandDetail(game.id, false, SYSTEM_USER_ID);

        trackedGameService.addGameRoundResult(game.id, 1, {
            type: 'TSUMO',
            winningHandData: { winnerPlayerId: userId, han: 1, fu: 30, yakumanCount: 0 },
            riichiPlayerIds: [userId],
        }, SYSTEM_USER_ID);

        trackedGameService.finishGame(game.id, SYSTEM_USER_ID);

        const states = achievementRepository.findUnlockedStatesByUserId(userId);
        const g1 = states.find(s => s.code === 'GAMES_1');
        expect(g1).toBeDefined();

        const firstRonOrTsumo = states.find(s => s.code === 'FIRST_TSUMO');
        expect(firstRonOrTsumo).toBeDefined();
    });

    it('corrects starting dice and recomputes achievements', () => {
        const players = [
            { userId, startPlace: Wind.EAST },
            { userId: 102, startPlace: Wind.SOUTH },
            { userId: 103, startPlace: Wind.WEST },
            { userId: 104, startPlace: Wind.NORTH },
        ];

        const game = trackedGameService.createTrackedGame(
            1,
            players,
            SYSTEM_USER_ID,
            GameStatus.IN_PROGRESS,
            undefined,
            undefined,
            undefined,
            [6, 6]
        );
        trackedGameService.setEnterHandDetail(game.id, false, SYSTEM_USER_ID);

        trackedGameService.addGameRoundResult(game.id, 1, {
            type: 'TSUMO',
            winningHandData: { winnerPlayerId: userId, han: 1, fu: 30, yakumanCount: 0 },
            riichiPlayerIds: [],
        }, SYSTEM_USER_ID);

        trackedGameService.finishGame(game.id, SYSTEM_USER_ID);

        const statesBefore = achievementRepository.findUnlockedStatesByUserId(userId);
        const boxcars = statesBefore.find(s => s.code === 'DICE_BOXCARS');
        expect(boxcars).toBeDefined();

        // Correct dice to 1, 1
        trackedGameService.setGameStartingDice(game.id, [1, 1], SYSTEM_USER_ID);

        const statesAfter = achievementRepository.findUnlockedStatesByUserId(userId);
        const snakeEyes = statesAfter.find(s => s.code === 'DICE_SNAKE_EYES');
        expect(snakeEyes).toBeDefined();
    });

    it('unlocks hand-detail achievements from a scored round', () => {
        const players = [
            { userId, startPlace: Wind.EAST },
            { userId: 102, startPlace: Wind.SOUTH },
            { userId: 103, startPlace: Wind.WEST },
            { userId: 104, startPlace: Wind.NORTH },
        ];

        const game = trackedGameService.createTrackedGame(1, players, SYSTEM_USER_ID, GameStatus.IN_PROGRESS);
        // enterHandDetail defaults to true, so rounds must carry a full hand

        trackedGameService.addGameRoundResult(game.id, 1, {
            type: 'TSUMO',
            winningHandData: {
                winnerPlayerId: userId,
                yakumanCount: 0,
                handDetail: {
                    concealedTiles: [
                        'man_1',
                        'man_1',
                        'pin_2',
                        'pin_2',
                        'sou_3',
                        'sou_3',
                        'ton',
                        'ton',
                        'nan',
                        'nan',
                        'haku',
                        'haku',
                        'hatsu',
                    ],
                    melds: [],
                    winningTile: 'hatsu',
                    doraIndicators: [],
                    uraDoraIndicators: [],
                    context: { ippatsu: true },
                },
            },
            riichiPlayerIds: [userId],
        }, SYSTEM_USER_ID);

        trackedGameService.finishGame(game.id, SYSTEM_USER_ID);

        const unlocked = achievementRepository.findUnlockedStatesByUserId(userId);
        expect(unlocked.find(s => s.code === 'FIRST_IPPATSU')).toBeDefined();

        const progress = achievementRepository.findProgressStatesByUserId(userId);
        const chiitoitsu = progress.find(s => s.code === 'CHIITOITSU_10');
        expect(chiitoitsu?.progress).toBe(1);
        expect(progress.find(s => s.code === 'MENZEN_WINS_50')?.progress).toBe(1);
    });
});
