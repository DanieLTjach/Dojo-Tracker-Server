import { BadRequestError, NotFoundError } from "./BaseErrors.ts";

export class GameNotFoundById extends NotFoundError {
    constructor(id: number) {
        super(`Game with id ${id} not found`, 'gameNotFoundById');
    }
}

export class TooManyGamesFoundError extends BadRequestError {
    constructor() {
        super(`Too many games found. Please narrow down your search criteria.`, 'tooManyGamesFound');
    }
}

export class IncorrectPlayerCountError extends BadRequestError {
    constructor(requiredPlayers: number) {
        super(`${requiredPlayers} players are required for a game`, 'incorrectPlayerCount');
    }
}

export class DuplicatePlayerError extends BadRequestError {
    constructor(userIdentifier: string) {
        super(`Player ${userIdentifier} is present more than once in this game`, 'duplicatePlayer');
    }
}

export class EventNotFoundError extends NotFoundError {
    constructor(eventId: number) {
        super(`Event with id ${eventId} not found`, 'eventNotFound');
    }
}
