import { InternalServerError, NotFoundError } from "./BaseErrors.ts";

export class EventNotFoundError extends NotFoundError {
    constructor(eventId: number) {
        super(`Event with id ${eventId} not found`, 'eventNotFound');
    }
}

export class GameRulesNotFoundError extends InternalServerError {
    constructor(eventId: number) {
        super(`Game rules for event with id ${eventId} not found`, 'gameRulesNotFound');
    }
}
