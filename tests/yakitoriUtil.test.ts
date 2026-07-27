import { calculateYakitoriPointChanges, findPlayersWhoWonAHand } from '../src/util/YakitoriUtil.ts';
import type { GameRound, GamePlayer } from '../src/model/GameModels.ts';
import { Wind } from '../src/model/GameModels.ts';
import { fourPlayers } from './pointCalculationUtil.helpers.ts';

function sanmaPlayers(): GamePlayer[] {
    return [
        {
            gameId: 1,
            userId: 1,
            name: 'player-1',
            telegramUsername: null,
            profileFirstName: null,
            profileLastName: null,
            profileHidden: false,
            points: 35000,
            ratingChange: 0,
            startPlace: Wind.EAST,
            chomboCount: 0,
            isSubstitutePlayer: false,
        },
        {
            gameId: 1,
            userId: 2,
            name: 'player-2',
            telegramUsername: null,
            profileFirstName: null,
            profileLastName: null,
            profileHidden: false,
            points: 35000,
            ratingChange: 0,
            startPlace: Wind.SOUTH,
            chomboCount: 0,
            isSubstitutePlayer: false,
        },
        {
            gameId: 1,
            userId: 3,
            name: 'player-3',
            telegramUsername: null,
            profileFirstName: null,
            profileLastName: null,
            profileHidden: false,
            points: 35000,
            ratingChange: 0,
            startPlace: Wind.WEST,
            chomboCount: 0,
            isSubstitutePlayer: false,
        },
    ];
}

describe('YakitoriUtil', () => {
    describe('findPlayersWhoWonAHand', () => {
        it('should correctly identify hand winners from TSUMO and RON (including double ron)', () => {
            const rounds: GameRound[] = [
                {
                    gameId: 1,
                    roundNumber: 1,
                    wind: Wind.EAST,
                    dealerNumber: 1,
                    counters: 0,
                    riichiSticks: 0,
                    result: {
                        type: 'TSUMO',
                        winningHandData: { winnerPlayerId: 1, han: 1, fu: 30, yaku: [] },
                        riichiPlayerIds: [],
                        paos: [],
                    },
                },
                {
                    gameId: 1,
                    roundNumber: 2,
                    wind: Wind.EAST,
                    dealerNumber: 2,
                    counters: 0,
                    riichiSticks: 0,
                    result: {
                        type: 'RON',
                        winningHandData: [
                            { winnerPlayerId: 2, loserPlayerId: 4, han: 2, fu: 30, yaku: [] },
                            { winnerPlayerId: 3, loserPlayerId: 4, han: 3, fu: 30, yaku: [] },
                        ],
                        riichiPlayerIds: [],
                        paos: [],
                    },
                },
            ];

            const winners = findPlayersWhoWonAHand(rounds);
            expect(winners).toEqual(new Set([1, 2, 3]));
        });

        it('should not mark nagashi mangan, abortive draw, or chombo as hand wins', () => {
            const rounds: GameRound[] = [
                {
                    gameId: 1,
                    roundNumber: 1,
                    wind: Wind.EAST,
                    dealerNumber: 1,
                    counters: 0,
                    riichiSticks: 0,
                    result: {
                        type: 'EXHAUSTIVE_DRAW',
                        tenpaiPlayerIds: [1],
                        nagashiManganPlayerIds: [1],
                        riichiPlayerIds: [],
                    },
                },
                {
                    gameId: 1,
                    roundNumber: 2,
                    wind: Wind.EAST,
                    dealerNumber: 1,
                    counters: 1,
                    riichiSticks: 0,
                    result: {
                        type: 'ABORTIVE_DRAW',
                        reason: 'FOUR_RIICHI',
                        riichiPlayerIds: [1, 2, 3, 4],
                    },
                },
                {
                    gameId: 1,
                    roundNumber: 3,
                    wind: Wind.EAST,
                    dealerNumber: 1,
                    counters: 2,
                    riichiSticks: 4,
                    result: {
                        type: 'CHOMBO',
                        chomboPlayerId: 2,
                    },
                },
            ];

            const winners = findPlayersWhoWonAHand(rounds);
            expect(winners.size).toBe(0);
        });
    });

    describe('calculateYakitoriPointChanges', () => {
        const rules4k = { yakitori_payment_step: 4000 };

        function sumChanges(changes: { pointChange: number }[]) {
            return changes.reduce((acc, c) => acc + c.pointChange, 0);
        }

        it('yonma, 1 yakitori (player 4)', () => {
            const players = fourPlayers();
            const changes = calculateYakitoriPointChanges(players, rules4k, new Set([4]));

            expect(changes).toEqual([
                { playerId: 4, pointChange: -12000 },
                { playerId: 1, pointChange: 4000 },
                { playerId: 2, pointChange: 4000 },
                { playerId: 3, pointChange: 4000 },
            ]);
            expect(sumChanges(changes)).toBe(0);
        });

        it('yonma, 2 yakitori (players 3, 4)', () => {
            const players = fourPlayers();
            const changes = calculateYakitoriPointChanges(players, rules4k, new Set([3, 4]));

            expect(changes).toEqual([
                { playerId: 3, pointChange: -8000 },
                { playerId: 4, pointChange: -8000 },
                { playerId: 1, pointChange: 8000 },
                { playerId: 2, pointChange: 8000 },
            ]);
            expect(sumChanges(changes)).toBe(0);
        });

        it('yonma, 3 yakitori (players 2, 3, 4)', () => {
            const players = fourPlayers();
            const changes = calculateYakitoriPointChanges(players, rules4k, new Set([2, 3, 4]));

            expect(changes).toEqual([
                { playerId: 2, pointChange: -4000 },
                { playerId: 3, pointChange: -4000 },
                { playerId: 4, pointChange: -4000 },
                { playerId: 1, pointChange: 12000 },
            ]);
            expect(sumChanges(changes)).toBe(0);
        });

        it('sanma, 1 yakitori (player 3)', () => {
            const players = sanmaPlayers();
            const changes = calculateYakitoriPointChanges(players, rules4k, new Set([3]));

            expect(changes).toEqual([
                { playerId: 3, pointChange: -8000 },
                { playerId: 1, pointChange: 4000 },
                { playerId: 2, pointChange: 4000 },
            ]);
            expect(sumChanges(changes)).toBe(0);
        });

        it('sanma, 2 yakitori (players 2, 3)', () => {
            const players = sanmaPlayers();
            const changes = calculateYakitoriPointChanges(players, rules4k, new Set([2, 3]));

            expect(changes).toEqual([
                { playerId: 2, pointChange: -4000 },
                { playerId: 3, pointChange: -4000 },
                { playerId: 1, pointChange: 8000 },
            ]);
            expect(sumChanges(changes)).toBe(0);
        });

        it('returns [] when step is 0, nobody is yakitori, or everybody is yakitori', () => {
            const players = fourPlayers();

            expect(calculateYakitoriPointChanges(players, { yakitori_payment_step: 0 }, new Set([4]))).toEqual([]);
            expect(calculateYakitoriPointChanges(players, rules4k, new Set())).toEqual([]);
            expect(calculateYakitoriPointChanges(players, rules4k, new Set([1, 2, 3, 4]))).toEqual([]);
        });

        it('remains strictly zero-sum for an awkward step value (4,100)', () => {
            const players = fourPlayers();
            const changes = calculateYakitoriPointChanges(players, { yakitori_payment_step: 4100 }, new Set([4]));

            expect(changes).toEqual([
                { playerId: 4, pointChange: -12300 },
                { playerId: 1, pointChange: 4100 },
                { playerId: 2, pointChange: 4100 },
                { playerId: 3, pointChange: 4100 },
            ]);
            expect(sumChanges(changes)).toBe(0);
        });
    });
});
