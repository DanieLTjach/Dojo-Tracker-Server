import { buildSyntheticGame } from '../src/util/SyntheticGameUtil.ts';
import { GameStatus, TimerStatus, Wind } from '../src/model/GameModels.ts';

describe('SyntheticGameUtil', () => {
    it('builds a DetailedGame with correct synthetic values and supplied player/state data', () => {
        const players = [
            { userId: 1, points: 25000, startPlace: Wind.EAST, chomboCount: 0 },
            { userId: 2, points: 25000, startPlace: Wind.SOUTH, chomboCount: 0 },
            { userId: 3, points: 25000, startPlace: Wind.WEST, chomboCount: 0 },
            { userId: 4, points: 25000, startPlace: Wind.NORTH, chomboCount: 0 },
        ];
        const currentState = {
            wind: Wind.EAST,
            dealerNumber: 1,
            counters: 0,
            riichiSticks: 0,
        };

        const game = buildSyntheticGame(players, currentState);

        expect(game.id).toBe(0);
        expect(game.eventId).toBe(0);
        expect(game.status).toBe(GameStatus.IN_PROGRESS);
        expect(game.currentState).toEqual(currentState);
        expect(game.rounds).toEqual([]);
        expect(game.timer.status).toBe(TimerStatus.STOPPED);
        expect(game.players).toHaveLength(4);
        expect(game.players[0]).toEqual({
            gameId: 0,
            userId: 1,
            name: '',
            telegramUsername: null,
            profileFirstName: null,
            profileLastName: null,
            profileHidden: false,
            points: 25000,
            ratingChange: 0,
            startPlace: Wind.EAST,
            chomboCount: 0,
            isSubstitutePlayer: false,
        });
    });
});
