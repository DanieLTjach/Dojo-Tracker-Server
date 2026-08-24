import { evaluateAutomaticAchievements, type EvaluatorGame } from '../src/util/AutomaticAchievementEvaluator.ts';
import { Wind } from '../src/model/GameModels.ts';

describe('AutomaticAchievementEvaluator', () => {
    function makeGame(
        id: number,
        players: { userId: number, points: number, startPlace?: Wind, isFillerPlayer?: boolean }[],
        opts: { gameSize?: 3 | 4, rounds?: any[], endedAt?: string, dice?: [number, number] } = {}
    ): EvaluatorGame {
        const endedAt = opts.endedAt
            ? new Date(opts.endedAt)
            : new Date(`2026-01-01T10:${id < 10 ? '0' + id : id}:00.000Z`);
        const gameSize = opts.gameSize ?? 4;
        const defaultWinds = gameSize === 3
            ? [Wind.EAST, Wind.SOUTH, Wind.WEST]
            : [Wind.EAST, Wind.SOUTH, Wind.WEST, Wind.NORTH];

        return {
            id,
            clubId: 1,
            eventId: 1,
            gameSize,
            startedAt: endedAt,
            endedAt,
            players: players.map((p, idx) => ({
                userId: p.userId,
                points: p.points,
                startPlace: p.startPlace ?? defaultWinds[idx]!,
                isSubstitutePlayer: false,
                isFillerPlayer: p.isFillerPlayer ?? false,
            })),
            rounds: opts.rounds ?? [],
            startingDie1: opts.dice ? opts.dice[0] : null,
            startingDie2: opts.dice ? opts.dice[1] : null,
        };
    }

    it('evaluates career game milestones and wins', () => {
        const games: EvaluatorGame[] = [];
        for (let i = 1; i <= 10; i++) {
            games.push(makeGame(i, [
                { userId: 101, points: 40000 },
                { userId: 102, points: 30000 },
                { userId: 103, points: 20000 },
                { userId: 104, points: 10000 },
            ]));
        }

        const results = evaluateAutomaticAchievements(games, [], []);

        const g1 = results.find(r => r.userId === 101 && r.code === 'GAMES_1');
        expect(g1).toBeDefined();
        expect(g1?.unlockedAt).not.toBeNull();

        const g10 = results.find(r => r.userId === 101 && r.code === 'GAMES_10');
        expect(g10).toBeDefined();
        expect(g10?.unlockedAt).not.toBeNull();

        const w10 = results.find(r => r.userId === 101 && r.code === 'WINS_10');
        expect(w10).toBeDefined();
        expect(w10?.unlockedAt).not.toBeNull();
    });

    it('evaluates starting East win, 4-wind collection, and margins', () => {
        const g1 = makeGame(1, [
            { userId: 101, points: 30100, startPlace: Wind.EAST },
            { userId: 102, points: 29900, startPlace: Wind.SOUTH },
            { userId: 103, points: 20000, startPlace: Wind.WEST },
            { userId: 104, points: 20000, startPlace: Wind.NORTH },
        ]);

        const results = evaluateAutomaticAchievements([g1], [], []);

        const eastWin = results.find(r => r.userId === 101 && r.code === 'WIN_STARTING_EAST');
        expect(eastWin?.unlockedAt).not.toBeNull();

        const narrowWin = results.find(r => r.userId === 101 && r.code === 'WIN_BY_MARGIN_1000');
        expect(narrowWin?.unlockedAt).not.toBeNull();
    });

    it('evaluates dice rolls for starting East player', () => {
        const g1 = makeGame(1, [
            { userId: 101, points: 30000, startPlace: Wind.EAST },
            { userId: 102, points: 25000, startPlace: Wind.SOUTH },
            { userId: 103, points: 25000, startPlace: Wind.WEST },
            { userId: 104, points: 20000, startPlace: Wind.NORTH },
        ], { dice: [1, 1] });

        const results = evaluateAutomaticAchievements([g1], [], []);

        const diceFirst = results.find(r => r.userId === 101 && r.code === 'DICE_FIRST_ROLL');
        expect(diceFirst?.unlockedAt).not.toBeNull();

        const snakeEyes = results.find(r => r.userId === 101 && r.code === 'DICE_SNAKE_EYES');
        expect(snakeEyes?.unlockedAt).not.toBeNull();

        const double = results.find(r => r.userId === 101 && r.code === 'DICE_ANY_DOUBLE');
        expect(double?.unlockedAt).not.toBeNull();
    });

    it('evaluates OpenSkill peak ratings and underdog win', () => {
        const skillResults = [{
            clubId: 1,
            gameSize: 4 as const,
            gameId: 1,
            timestamp: new Date('2026-01-01T12:00:00.000Z'),
            userSnapshots: [
                {
                    userId: 101,
                    initialMu: 20,
                    initialSigma: 8,
                    initialDisplayRating: 1400,
                    finalMu: 25,
                    finalSigma: 3.5,
                    finalDisplayRating: 1650,
                    place: 1,
                },
                {
                    userId: 102,
                    initialMu: 30,
                    initialSigma: 2,
                    initialDisplayRating: 1800,
                    finalMu: 29,
                    finalSigma: 2,
                    finalDisplayRating: 1770,
                    place: 2,
                },
            ],
        }];

        const results = evaluateAutomaticAchievements([], [], skillResults);

        const peak1600 = results.find(r => r.userId === 101 && r.code === 'OPENSKILL_PEAK_1600');
        expect(peak1600?.unlockedAt).not.toBeNull();

        const provExit = results.find(r => r.userId === 101 && r.code === 'OPENSKILL_LEAVE_PROVISIONAL');
        expect(provExit?.unlockedAt).not.toBeNull();

        const underdog = results.find(r => r.userId === 101 && r.code === 'OPENSKILL_UNDERDOG_WIN');
        expect(underdog?.unlockedAt).not.toBeNull();
    });

    it('evaluates tournament champion and podium achievements', () => {
        const placements = [{
            eventId: 10,
            clubId: 1,
            isSeason: false,
            dateTo: new Date('2026-02-01T18:00:00.000Z'),
            isFinished: true,
            placements: [
                { userId: 101, place: 1, isEligible: true },
                { userId: 102, place: 2, isEligible: true },
                { userId: 103, place: 3, isEligible: true },
            ],
        }];

        const results = evaluateAutomaticAchievements([], placements, []);

        const champion = results.find(r =>
            r.userId === 101 && r.code === 'TOURNAMENT_CHAMPION' && r.scope === 'EVENT:10'
        );
        expect(champion?.unlockedAt).not.toBeNull();

        const debut = results.find(r => r.userId === 101 && r.code === 'EVENT_DEBUT');
        expect(debut?.unlockedAt).not.toBeNull();
    });

    it('evaluates timing, yaku, dora, and kan achievements from persisted hand detail', () => {
        const g1 = makeGame(1, [
            { userId: 101, points: 35000 },
            { userId: 102, points: 25000 },
            { userId: 103, points: 25000 },
            { userId: 104, points: 15000 },
        ], {
            rounds: [{
                roundNumber: 1,
                wind: Wind.EAST,
                dealerNumber: 1,
                counters: 0,
                riichiSticks: 0,
                result: {
                    type: 'TSUMO',
                    winningHandData: {
                        winnerPlayerId: 101,
                        han: 8,
                        fu: 30,
                        yakumanCount: 0,
                        handDetail: {
                            concealedTiles: [],
                            melds: [{ type: 'ANKAN', tiles: ['ton', 'ton', 'ton', 'ton'] }],
                            winningTile: 'pin_5',
                            doraIndicators: ['sou_3'],
                            uraDoraIndicators: [],
                        },
                        yaku: [
                            { code: 'riichi', han: 1 },
                            { code: 'ippatsu', han: 1 },
                            { code: 'pinfu', han: 1 },
                            { code: 'ankou', han: 2 } as any,
                            { code: 'dora', han: 5 },
                        ],
                    },
                    playerPointChanges: [],
                },
            }],
        });

        const results = evaluateAutomaticAchievements([g1], [], []);

        expect(results.find(r => r.userId === 101 && r.code === 'FIRST_IPPATSU')?.unlockedAt).not.toBeNull();
        expect(results.find(r => r.userId === 101 && r.code === 'FIRST_PINFU')?.unlockedAt).not.toBeNull();
        expect(results.find(r => r.userId === 101 && r.code === 'DORA_5_ONE_HAND')?.unlockedAt).not.toBeNull();
        expect(results.find(r => r.userId === 101 && r.code === 'NO_DORA_MANGAN')).toBeUndefined();

        const firstKan = results.find(r => r.userId === 101 && r.code === 'FIRST_KAN');
        expect(firstKan?.unlockedAt).not.toBeNull();
        expect(results.find(r => r.userId === 101 && r.code === 'FIRST_ANKAN')?.unlockedAt).not.toBeNull();

        // Ankan keeps the hand concealed, so this still counts as menzen progress
        const menzen = results.find(r => r.userId === 101 && r.code === 'MENZEN_WINS_50');
        expect(menzen).toBeDefined();
        expect(menzen?.progress).toBe(1);
        expect(results.find(r => r.userId === 101 && r.code === 'OPEN_HAND_WIN_10')).toBeUndefined();
    });

    it('evaluates yakuman-specific firsts and pao liability', () => {
        const g1 = makeGame(1, [
            { userId: 101, points: 40000 },
            { userId: 102, points: 20000 },
            { userId: 103, points: 20000 },
            { userId: 104, points: 20000 },
        ], {
            rounds: [{
                roundNumber: 1,
                wind: Wind.EAST,
                dealerNumber: 1,
                counters: 0,
                riichiSticks: 0,
                result: {
                    type: 'RON',
                    dealInPlayerId: 103,
                    winningHandData: [{
                        winnerPlayerId: 101,
                        yakumanCount: 1,
                        yakumanLiabilityPlayerId: 102,
                        yaku: [{ code: 'daisangen', yakumanCount: 1 }],
                    }],
                    playerPointChanges: [],
                },
            }],
        });

        const results = evaluateAutomaticAchievements([g1], [], []);

        expect(results.find(r => r.userId === 101 && r.code === 'FIRST_DAISANGEN')?.unlockedAt).not.toBeNull();
        expect(results.find(r => r.userId === 102 && r.code === 'YAKUMAN_LIABILITY')?.unlockedAt).not.toBeNull();

        const paoProgress = results.find(r => r.userId === 102 && r.code === 'PAID_PAO_3');
        expect(paoProgress).toBeDefined();
        expect(paoProgress?.progress).toBe(1);
    });

    it('evaluates nagashi mangan from exhaustive draws', () => {
        const g1 = makeGame(1, [
            { userId: 101, points: 32000 },
            { userId: 102, points: 26000 },
            { userId: 103, points: 22000 },
            { userId: 104, points: 20000 },
        ], {
            rounds: [{
                roundNumber: 1,
                wind: Wind.EAST,
                dealerNumber: 1,
                counters: 0,
                riichiSticks: 0,
                result: {
                    type: 'EXHAUSTIVE_DRAW',
                    riichiPlayerIds: [],
                    tenpaiPlayerIds: [101, 102],
                    nagashiManganPlayerIds: [101],
                    playerPointChanges: [],
                },
            }],
        });

        const results = evaluateAutomaticAchievements([g1], [], []);

        expect(results.find(r => r.userId === 101 && r.code === 'NAGASHI_MANGAN')?.unlockedAt).not.toBeNull();
    });

    it('evaluates sanma kita achievements', () => {
        const g1 = makeGame(1, [
            { userId: 101, points: 40000 },
            { userId: 102, points: 25000 },
            { userId: 103, points: 15000 },
        ], {
            gameSize: 3,
            rounds: [{
                roundNumber: 1,
                wind: Wind.EAST,
                dealerNumber: 1,
                counters: 0,
                riichiSticks: 0,
                result: {
                    type: 'TSUMO',
                    winningHandData: {
                        winnerPlayerId: 101,
                        han: 5,
                        fu: 40,
                        yakumanCount: 0,
                        handDetail: {
                            concealedTiles: [],
                            melds: [],
                            winningTile: 'pei',
                            doraIndicators: [],
                            uraDoraIndicators: [],
                            kitaCount: 8,
                        },
                        yaku: [
                            { code: 'riichi', han: 1 },
                            { code: 'kita', han: 8 },
                        ],
                    },
                    playerPointChanges: [],
                },
            }],
        });

        const results = evaluateAutomaticAchievements([g1], [], []);

        expect(results.find(r => r.userId === 101 && r.code === 'SANMA_FIRST_KITA')?.unlockedAt).not.toBeNull();
        expect(results.find(r => r.userId === 101 && r.code === 'SANMA_KITA_8_ONE_HAND')?.unlockedAt).not.toBeNull();
    });

    it('evaluates OpenSkill loss, gain streak, and multi-club provisional', () => {
        const snap = (userId: number, initial: number, final: number, place: number, sigma = 3) => ({
            userId,
            initialMu: initial,
            initialSigma: sigma,
            initialDisplayRating: initial,
            finalMu: final,
            finalSigma: sigma,
            finalDisplayRating: final,
            place,
        });
        const skillResults = [
            {
                clubId: 1,
                gameSize: 4 as const,
                gameId: 1,
                timestamp: new Date('2026-01-01T12:00:00.000Z'),
                userSnapshots: [snap(101, 1800, 1810, 1), snap(102, 1700, 1690, 2)],
            },
            {
                clubId: 1,
                gameSize: 4 as const,
                gameId: 2,
                timestamp: new Date('2026-01-02T12:00:00.000Z'),
                userSnapshots: [snap(101, 1810, 1820, 1), snap(102, 1690, 1740, 2)],
            },
            {
                clubId: 1,
                gameSize: 4 as const,
                gameId: 3,
                timestamp: new Date('2026-01-03T12:00:00.000Z'),
                userSnapshots: [snap(101, 1820, 1830, 1), snap(102, 1740, 1680, 2)],
            },
            {
                clubId: 2,
                gameSize: 4 as const,
                gameId: 4,
                timestamp: new Date('2026-01-04T12:00:00.000Z'),
                userSnapshots: [snap(101, 1830, 1840, 1), snap(103, 1500, 1510, 2)],
            },
        ];

        const results = evaluateAutomaticAchievements([], [], skillResults);

        expect(results.find(r => r.userId === 101 && r.code === 'OPENSKILL_STREAK_GAIN_3')?.unlockedAt).not.toBeNull();
        expect(results.find(r => r.userId === 102 && r.code === 'OPENSKILL_LOSS_50_ONE_GAME')?.unlockedAt).not
            .toBeNull();
        expect(results.find(r => r.userId === 101 && r.code === 'OPENSKILL_MULTI_CLUB_RANKED_2')?.unlockedAt).not
            .toBeNull();
        expect(results.find(r => r.userId === 103 && r.code === 'OPENSKILL_MULTI_CLUB_RANKED_2')).toBeUndefined();
    });

    it('evaluates rank-1 defense when the track leader keeps winning', () => {
        const snap = (userId: number, initial: number, final: number, place: number) => ({
            userId,
            initialMu: initial,
            initialSigma: 3,
            initialDisplayRating: initial,
            finalMu: final,
            finalSigma: 3,
            finalDisplayRating: final,
            place,
        });
        const skillResults = [1, 2, 3].map(gameId => ({
            clubId: 1,
            gameSize: 4 as const,
            gameId,
            timestamp: new Date(`2026-01-0${gameId}T12:00:00.000Z`),
            // 101 starts as the clear track leader and wins every game
            userSnapshots: [
                snap(101, 1800 + gameId * 10 - 10, 1800 + gameId * 10, 1),
                snap(102, 1400, 1390 + gameId, 2),
            ],
        }));

        const results = evaluateAutomaticAchievements([], [], skillResults);

        const defend = results.find(r =>
            r.userId === 101 && r.code === 'OPENSKILL_RANK1_DEFEND_3' && r.scope === 'SKILL_4P:1'
        );
        expect(defend?.unlockedAt).not.toBeNull();

        // 102 never leads the track
        expect(results.find(r => r.userId === 102 && r.code === 'OPENSKILL_RANK1_DEFEND_3')).toBeUndefined();
    });
});
