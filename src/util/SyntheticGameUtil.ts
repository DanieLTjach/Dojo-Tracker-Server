import type { DetailedGame, GamePlayer, GameState, Wind } from '../model/GameModels.ts';
import { GameStatus, TimerStatus } from '../model/GameModels.ts';

export interface SyntheticGamePlayerInput {
    userId: number;
    points: number;
    startPlace: Wind;
    chomboCount: number;
}

export function buildSyntheticGame(
    players: SyntheticGamePlayerInput[],
    currentState: GameState
): DetailedGame {
    const now = new Date();
    const gamePlayers: GamePlayer[] = players.map(p => ({
        gameId: 0,
        userId: p.userId,
        name: '',
        telegramUsername: null,
        profileFirstName: null,
        profileLastName: null,
        profileHidden: false,
        points: p.points,
        ratingChange: 0,
        startPlace: p.startPlace,
        chomboCount: p.chomboCount,
        isSubstitutePlayer: false,
    }));

    return {
        id: 0,
        eventId: 0,
        createdAt: now,
        modifiedAt: now,
        modifiedBy: 0,
        tournamentRound: null,
        tournamentTable: null,
        status: GameStatus.IN_PROGRESS,
        startedAt: now,
        endedAt: null,
        lastRoundWasDeleted: false,
        players: gamePlayers,
        rounds: [],
        currentState,
        timer: {
            status: TimerStatus.STOPPED,
            durationSec: 0,
            remainingSec: 0,
            serverNow: now,
        },
    };
}
