import { NotFoundError } from "./BaseErrors.ts";

export class EventNotFoundError extends NotFoundError {
    constructor(eventId: number) {
        super(`Event with id ${eventId} not found`, 'eventNotFound');
    }
}
