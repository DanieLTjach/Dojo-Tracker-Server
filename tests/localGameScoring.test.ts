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
        // ruleset 6 is a 3-player ruleset in global seeds (Mahjong Soul Sanma)
        const players3 = [
            { userId: 1, points: 35000, startPlace: Wind.EAST, chomboCount: 0 },
            { userId: 2, points: 35000, startPlace: Wind.SOUTH, chomboCount: 0 },
            { userId: 3, points: 35000, startPlace: Wind.WEST, chomboCount: 0 },
        ];

        const result = service.scoreRoundPreview({
            gameRulesId: 6,
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

    it('calculates sanma (3 players) EXHAUSTIVE_DRAW deltas correctly with 2000 total penalty', () => {
        const players3 = [
            { userId: 1, points: 35000, startPlace: Wind.EAST, chomboCount: 0 },
            { userId: 2, points: 35000, startPlace: Wind.SOUTH, chomboCount: 0 },
            { userId: 3, points: 35000, startPlace: Wind.WEST, chomboCount: 0 },
        ];

        // 1 tenpai, 2 noten: player 1 receives +2000, players 2 and 3 pay -1000 each
        const result1Tenpai = service.scoreRoundPreview({
            gameRulesId: 6, // Mahjong Soul Sanma preset
            players: players3,
            currentState,
            result: {
                type: 'EXHAUSTIVE_DRAW',
                tenpaiPlayerIds: [1],
                nagashiManganPlayerIds: [],
                riichiPlayerIds: [],
            },
        });

        expect(result1Tenpai.playerPointChanges).toHaveLength(3);
        const p1 = result1Tenpai.playerPointChanges.find(p => p.playerId === 1);
        const p2 = result1Tenpai.playerPointChanges.find(p => p.playerId === 2);
        const p3 = result1Tenpai.playerPointChanges.find(p => p.playerId === 3);
        expect(p1?.pointChange).toBe(2000);
        expect(p2?.pointChange).toBe(-1000);
        expect(p3?.pointChange).toBe(-1000);

        // 2 tenpai, 1 noten: players 1 and 2 receive +1000 each, player 3 pays -2000
        const result2Tenpai = service.scoreRoundPreview({
            gameRulesId: 6,
            players: players3,
            currentState,
            result: {
                type: 'EXHAUSTIVE_DRAW',
                tenpaiPlayerIds: [1, 2],
                nagashiManganPlayerIds: [],
                riichiPlayerIds: [],
            },
        });

        expect(result2Tenpai.playerPointChanges).toHaveLength(3);
        const r2p1 = result2Tenpai.playerPointChanges.find(p => p.playerId === 1);
        const r2p2 = result2Tenpai.playerPointChanges.find(p => p.playerId === 2);
        const r2p3 = result2Tenpai.playerPointChanges.find(p => p.playerId === 3);
        expect(r2p1?.pointChange).toBe(1000);
        expect(r2p2?.pointChange).toBe(1000);
        expect(r2p3?.pointChange).toBe(-2000);
    });

    it('calculates sanma (3 players) CHOMBO deltas correctly with baiman penalty', () => {
        dbManager.db.prepare(
            `INSERT INTO gameRules (id, name, numberOfPlayers, uma, startingPoints, umaTieBreak, clubId, details)
             VALUES (9002, 'Sanma Baiman Chombo', 3, '[15,0,-15]', 35000, 'WIND', NULL, '{"preset":"mahjong_soul_sanma","rules":{"chombo":"baiman"}}')`
        ).run();

        const players3 = [
            { userId: 1, points: 35000, startPlace: Wind.EAST, chomboCount: 0 },
            { userId: 2, points: 35000, startPlace: Wind.SOUTH, chomboCount: 0 },
            { userId: 3, points: 35000, startPlace: Wind.WEST, chomboCount: 0 },
        ];

        // Non-dealer (player 2) commits chombo: dealer (p1) gets +8000, non-dealer (p3) gets +4000, offender (p2) pays -12000
        const result = service.scoreRoundPreview({
            gameRulesId: 9002,
            players: players3,
            currentState,
            result: {
                type: 'CHOMBO',
                offenderPlayerId: 2,
            },
        });

        expect(result.playerPointChanges).toHaveLength(3);
        const p1 = result.playerPointChanges.find(p => p.playerId === 1);
        const p2 = result.playerPointChanges.find(p => p.playerId === 2);
        const p3 = result.playerPointChanges.find(p => p.playerId === 3);
        expect(p1?.pointChange).toBe(8000);
        expect(p2?.pointChange).toBe(-12000);
        expect(p3?.pointChange).toBe(4000);
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
