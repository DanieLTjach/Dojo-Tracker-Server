import { gameScorePreviewSchema } from '../src/schema/GameSchemas.ts';

describe('gameScorePreviewSchema', () => {
    const validBody = {
        body: {
            gameRulesId: 1,
            players: [
                { userId: 1, points: 25000, startPlace: 'EAST', chomboCount: 0 },
                { userId: 2, points: 25000, startPlace: 'SOUTH', chomboCount: 0 },
                { userId: 3, points: 25000, startPlace: 'WEST', chomboCount: 0 },
                { userId: 4, points: 25000, startPlace: 'NORTH', chomboCount: 0 },
            ],
            currentState: {
                wind: 'EAST',
                dealerNumber: 1,
                counters: 0,
                riichiSticks: 0,
            },
            result: {
                type: 'TSUMO',
                winningHandData: { winnerPlayerId: 1, han: 1, fu: 30, yakumanCount: 0 },
                riichiPlayerIds: [],
            },
        },
    };

    it('passes with valid 4-player body', () => {
        expect(() => gameScorePreviewSchema.parse(validBody)).not.toThrow();
    });

    it('passes with valid 3-player body', () => {
        const body3 = {
            ...validBody,
            body: {
                ...validBody.body,
                players: validBody.body.players.slice(0, 3),
            },
        };
        expect(() => gameScorePreviewSchema.parse(body3)).not.toThrow();
    });

    it('fails with duplicate startPlace', () => {
        const bodyDupSeat = {
            ...validBody,
            body: {
                ...validBody.body,
                players: [
                    { userId: 1, points: 25000, startPlace: 'EAST', chomboCount: 0 },
                    { userId: 2, points: 25000, startPlace: 'EAST', chomboCount: 0 },
                    { userId: 3, points: 25000, startPlace: 'WEST', chomboCount: 0 },
                    { userId: 4, points: 25000, startPlace: 'NORTH', chomboCount: 0 },
                ],
            },
        };
        expect(() => gameScorePreviewSchema.parse(bodyDupSeat)).toThrow();
    });

    it('fails with duplicate userId', () => {
        const bodyDupUser = {
            ...validBody,
            body: {
                ...validBody.body,
                players: [
                    { userId: 1, points: 25000, startPlace: 'EAST', chomboCount: 0 },
                    { userId: 1, points: 25000, startPlace: 'SOUTH', chomboCount: 0 },
                    { userId: 3, points: 25000, startPlace: 'WEST', chomboCount: 0 },
                    { userId: 4, points: 25000, startPlace: 'NORTH', chomboCount: 0 },
                ],
            },
        };
        expect(() => gameScorePreviewSchema.parse(bodyDupUser)).toThrow();
    });

    it('fails with less than 3 players', () => {
        const body2 = {
            ...validBody,
            body: {
                ...validBody.body,
                players: validBody.body.players.slice(0, 2),
            },
        };
        expect(() => gameScorePreviewSchema.parse(body2)).toThrow();
    });
});
