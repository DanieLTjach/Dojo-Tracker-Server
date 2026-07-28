import { dbManager } from '../src/db/dbInit.ts';
import { resetTestDatabase } from './testHelpers.ts';
import { LocalGameScoringService } from '../src/service/LocalGameScoringService.ts';
import { IncorrectPlayerCountError } from '../src/error/GameErrors.ts';
import { SelectedRulesetHasNoDetailedRulesError } from '../src/error/PointCalculationErrors.ts';
import { Wind } from '../src/model/GameModels.ts';

describe('LocalGameScoringService', () => {
    let service: LocalGameScoringService;

    beforeAll(() => {
        dbManager.reinitDB();
        service = new LocalGameScoringService();
    });

    // Leave a clean, migrated database behind rather than deleting the shared
    // file — suites run in one process under --runInBand. This also discards the
    // legacy no-details ruleset the last test inserts.
    afterAll(() => {
        resetTestDatabase();
    });

    const currentState = {
        wind: Wind.EAST,
        dealerNumber: 1,
        counters: 0,
        riichiSticks: 0,
    };

    const players4 = [
        { userId: 1, points: 25000, startPlace: Wind.EAST, chomboCount: 0 },
        { userId: 2, points: 25000, startPlace: Wind.SOUTH, chomboCount: 0 },
        { userId: 3, points: 25000, startPlace: Wind.WEST, chomboCount: 0 },
        { userId: 4, points: 25000, startPlace: Wind.NORTH, chomboCount: 0 },
    ];

    it('calculates TSUMO deltas correctly', () => {
        const result = service.scoreRoundPreview({
            gameRulesId: 1, // EMA 2025 (4 players)
            players: players4,
            currentState,
            result: {
                type: 'TSUMO',
                winningHandData: {
                    winnerPlayerId: 1,
                    han: 1,
                    fu: 30,
                    yakumanCount: 0,
                },
                riichiPlayerIds: [],
            },
        });

        expect(result.playerPointChanges).toHaveLength(4);
        const winnerChange = result.playerPointChanges.find(p => p.playerId === 1);
        expect(winnerChange?.pointChange).toBe(1500); // 500 all from dealer = 1500
    });

    it('calculates RON deltas correctly', () => {
        const result = service.scoreRoundPreview({
            gameRulesId: 1,
            players: players4,
            currentState,
            result: {
                type: 'RON',
                dealInPlayerId: 1,
                winningHandData: [
                    {
                        winnerPlayerId: 2,
                        han: 1,
                        fu: 30,
                        yakumanCount: 0,
                    },
                ],
                riichiPlayerIds: [],
            },
        });

        expect(result.playerPointChanges).toHaveLength(2);
        const winner = result.playerPointChanges.find(p => p.playerId === 2);
        const loser = result.playerPointChanges.find(p => p.playerId === 1);
        expect(winner?.pointChange).toBe(1000);
        expect(loser?.pointChange).toBe(-1000);
    });

    it('calculates EXHAUSTIVE_DRAW deltas correctly', () => {
        const result = service.scoreRoundPreview({
            gameRulesId: 1,
            players: players4,
            currentState,
            result: {
                type: 'EXHAUSTIVE_DRAW',
                tenpaiPlayerIds: [1],
                nagashiManganPlayerIds: [],
                riichiPlayerIds: [],
            },
        });

        expect(result.playerPointChanges).toHaveLength(4);
        const tenpaiPlayer = result.playerPointChanges.find(p => p.playerId === 1);
        expect(tenpaiPlayer?.pointChange).toBe(3000);
    });

    it('calculates sanma (3 players) scoring correctly', () => {
        // ruleset 3 is a 3-player ruleset in global seeds
        const players3 = [
            { userId: 1, points: 35000, startPlace: Wind.EAST, chomboCount: 0 },
            { userId: 2, points: 35000, startPlace: Wind.SOUTH, chomboCount: 0 },
            { userId: 3, points: 35000, startPlace: Wind.WEST, chomboCount: 0 },
        ];

        const result = service.scoreRoundPreview({
            gameRulesId: 3,
            players: players3,
            currentState,
            result: {
                type: 'TSUMO',
                winningHandData: {
                    winnerPlayerId: 1,
                    han: 1,
                    fu: 30,
                    yakumanCount: 0,
                },
                riichiPlayerIds: [],
            },
        });

        expect(result.playerPointChanges).toHaveLength(3);
    });

    it('throws IncorrectPlayerCountError when player count does not match ruleset', () => {
        expect(() => {
            service.scoreRoundPreview({
                gameRulesId: 1, // 4-player ruleset
                players: players4.slice(0, 3), // only 3 players
                currentState,
                result: {
                    type: 'EXHAUSTIVE_DRAW',
                    tenpaiPlayerIds: [],
                    nagashiManganPlayerIds: [],
                    riichiPlayerIds: [],
                },
            });
        }).toThrow(IncorrectPlayerCountError);
    });

    it('handles gameFinishReason with nextState: undefined and riichi-stick payout', () => {
        // Last round of game (SOUTH 4 dealer 4), dealer loses or bankruptcy, or played all rounds
        // Let's set SOUTH wind, dealer 4 (player 4 is dealer), SOUTH 4 round.
        const southState = {
            wind: Wind.SOUTH,
            dealerNumber: 4,
            counters: 0,
            riichiSticks: 1, // 1 leftover riichi stick in pool
        };

        const result = service.scoreRoundPreview({
            gameRulesId: 1,
            players: [
                { userId: 1, points: 40000, startPlace: Wind.EAST, chomboCount: 0 },
                { userId: 2, points: 20000, startPlace: Wind.SOUTH, chomboCount: 0 },
                { userId: 3, points: 20000, startPlace: Wind.WEST, chomboCount: 0 },
                { userId: 4, points: 19000, startPlace: Wind.NORTH, chomboCount: 0 },
            ],
            currentState: southState,
            result: {
                type: 'RON',
                dealInPlayerId: 4, // dealer loses
                winningHandData: [
                    {
                        winnerPlayerId: 1, // non-dealer wins
                        han: 1,
                        fu: 30,
                        yakumanCount: 0,
                    },
                ],
                riichiPlayerIds: [],
            },
        });

        expect(result.gameFinishReason).toBeDefined();
        expect(result.nextState).toBeUndefined();
        // Player 1 wins round (1000 pts) + claims riichi stick (1000 pts) = +2000 total
        const winner = result.playerPointChanges.find(p => p.playerId === 1);
        expect(winner?.pointChange).toBe(2000);
    });

    it('rejects a ruleset with no detailed rules as bad input, not a 500', () => {
        // Legacy rows can still have a NULL details column in production.
        dbManager.db.prepare(
            `INSERT INTO gameRules (id, name, numberOfPlayers, uma, startingPoints, umaTieBreak, clubId, details)
             VALUES (9001, 'Legacy no-details', 4, '[15,5,-5,-15]', 25000, 'WIND', NULL, NULL)`
        ).run();

        expect(() =>
            service.scoreRoundPreview({
                gameRulesId: 9001,
                players: players4,
                currentState,
                result: {
                    type: 'TSUMO',
                    winningHandData: { winnerPlayerId: 1, han: 1, fu: 30, yakumanCount: 0 },
                    riichiPlayerIds: [],
                },
            })
        ).toThrow(SelectedRulesetHasNoDetailedRulesError);
    });
});
