import { NotFoundError, BadRequestError } from "./BaseErrors.ts";

export class EventNotFoundError extends NotFoundError {
    constructor(eventId: number) {
        super('eventNotFound', { eventId });
    }
}

export class GameRulesNotFoundError extends NotFoundError {
    constructor(gameRulesId: number) {
        super('gameRulesNotFound', { gameRulesId });
    }
}

export class CannotDeleteGameRulesInUseError extends BadRequestError {
    constructor(gameRulesName: string, eventCount: number) {
        super('cannotDeleteGameRulesInUse', { gameRulesName, eventCount });
    }
}

export class CannotUpdateGameRulesInUseError extends BadRequestError {
    constructor(gameRulesName: string, gameCount: number) {
        super('cannotUpdateGameRulesInUse', { gameRulesName, gameCount });
    }
}

export class CannotDeleteEventWithGamesError extends BadRequestError {
    constructor(eventName: string, gameCount: number) {
        super('cannotDeleteEventWithGames', { eventName, gameCount });
    }
}

export class CannotDeleteEventWithRegistrationsError extends BadRequestError {
    constructor(eventName: string, registrationCount: number) {
        super('cannotDeleteEventWithRegistrations', { eventName, registrationCount });
    }
}

export class CurrentRatingEventMustBeClubScopedError extends BadRequestError {
    constructor() {
        super('currentRatingEventMustBeClubScoped');
    }
}

export class TournamentMustHaveClubError extends BadRequestError {
    constructor() {
        super('tournamentMustHaveClub');
    }
}

export class GameCreationBlockedError extends BadRequestError {
    constructor(eventName: string) {
        super('gameCreationBlocked', { eventName });
    }
}
