import type { GameRulesValues } from '../src/data/gameRulesCatalog.ts';
import { UmaTieBreak } from '../src/model/EventModels.ts';
import type { GameRules } from '../src/model/EventModels.ts';
import { GameStatus, Wind } from '../src/model/GameModels.ts';
import type { DetailedGame, GamePlayer, GameState } from '../src/model/GameModels.ts';

const DEFAULT_POINTS: [number, number, number, number] = [25000, 25000, 25000, 25000];

export function fourPlayers(
    [p0, p1, p2, p3]: [number, number, number, number] = DEFAULT_POINTS,
): GamePlayer[] {
    return [
        { gameId: 1, userId: 1, name: 'player-1', telegramUsername: null, profileFirstName: null, profileLastName: null, profileHidden: false, points: p0, ratingChange: 0, startPlace: Wind.EAST, chomboCount: 0, isSubstitutePlayer: false },
        { gameId: 1, userId: 2, name: 'player-2', telegramUsername: null, profileFirstName: null, profileLastName: null, profileHidden: false, points: p1, ratingChange: 0, startPlace: Wind.SOUTH, chomboCount: 0, isSubstitutePlayer: false },
        { gameId: 1, userId: 3, name: 'player-3', telegramUsername: null, profileFirstName: null, profileLastName: null, profileHidden: false, points: p2, ratingChange: 0, startPlace: Wind.WEST, chomboCount: 0, isSubstitutePlayer: false },
        { gameId: 1, userId: 4, name: 'player-4', telegramUsername: null, profileFirstName: null, profileLastName: null, profileHidden: false, points: p3, ratingChange: 0, startPlace: Wind.NORTH, chomboCount: 0, isSubstitutePlayer: false },
    ];
}

export function gameState(
    wind: Wind,
    dealerNumber = 1,
    counters = 0,
    riichiSticks = 0,
): GameState {
    return { wind, dealerNumber, counters, riichiSticks };
}

export function makeGameRules(rules: GameRulesValues): GameRules {
    return {
        id: 1,
        name: 'test',
        clubId: null,
        numberOfPlayers: 4,
        uma: [15, 5, -5, -15],
        startingPoints: 25000,
        chomboPointsAfterUma: null,
        umaTieBreak: UmaTieBreak.WIND,
        details: { rules },
    };
}

export function detailedGame(
    players: GamePlayer[],
    currentState: GameState,
): DetailedGame {
    const now = new Date('2026-01-01T00:00:00.000Z');
    return {
        id: 1,
        eventId: 1,
        createdAt: now,
        modifiedAt: now,
        modifiedBy: 0,
        tournamentRound: null,
        tournamentTable: null,
        status: GameStatus.IN_PROGRESS,
        startedAt: now,
        endedAt: null,
        lastRoundWasDeleted: false,
        players,
        rounds: [],
        currentState,
    };
}
