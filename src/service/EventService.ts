import { EventNotFoundError } from "../error/EventErrors.ts";
import { EventRepository } from "../repository/EventRepository.ts";

export class EventService {

    private eventRepository: EventRepository = new EventRepository();

    validateEventExists(eventId: number): void {
        const event = this.eventRepository.findEventById(eventId);
        if (!event) {
            throw new EventNotFoundError(eventId);
        }
    }
}