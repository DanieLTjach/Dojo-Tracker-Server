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
});
