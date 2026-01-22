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
    constructor(userId: number) {
        super(`Player with ID ${userId} is present more than once in this game`, 'duplicatePlayer');
    }
}

export class DuplicateGameTimestampInEventError extends BadRequestError {
    constructor() {
        super('Someone is trying to add a game simultaneously with you. Please try again', 'duplicateGameTimestampInEvent');
    }
}

export class IncorrectTotalPointsError extends BadRequestError {
    constructor(expectedTotal: number, actualTotal: number) {
        super(`Total points must equal ${expectedTotal}, but got ${actualTotal}`, 'incorrectTotalPoints');
    }
}

export class EventHasntStartedError extends BadRequestError {
    constructor() {
        super('Event has not started yet', 'eventHasntStarted');
    }
}

export class EventHasEndedError extends BadRequestError {
    constructor() {
        super('Event has ended', 'eventHasEnded');
    }
}
