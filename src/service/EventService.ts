import { EventNotFoundError, GameRulesNotFoundError, CannotDeleteEventWithGamesError } from '../error/EventErrors.ts';
import type { Event } from '../model/EventModels.ts';
import { EventRepository } from '../repository/EventRepository.ts';

export class EventService {
    private eventRepository: EventRepository = new EventRepository();

    getAllEvents(): Event[] {
        return this.eventRepository.findAllEvents();
    }

    getEventById(eventId: number): Event {
        const event = this.eventRepository.findEventById(eventId);
        if (!event) {
            throw new EventNotFoundError(eventId);
        }
        return event;
    }

    validateEventExists(eventId: number): Event {
        const event = this.eventRepository.findEventById(eventId);
        if (!event) {
            throw new EventNotFoundError(eventId);
        }
        return event;
    }

    createEvent(data: EventCreateData, modifiedBy: number): Event {
        if (!this.eventRepository.gameRulesExists(data.gameRulesId)) {
            throw new GameRulesNotFoundError(data.gameRulesId);
        }

        const now = new Date();
        const eventId = this.eventRepository.createEvent({
            name: data.name,
            description: data.description ?? null,
            type: data.type,
            gameRules: data.gameRulesId,
            dateFrom: data.dateFrom ?? null,
            dateTo: data.dateTo ?? null,
            createdAt: now,
            modifiedAt: now,
            modifiedBy
        });

        return this.getEventById(eventId);
    }

    updateEvent(eventId: number, data: EventUpdateData, modifiedBy: number): Event {
        this.validateEventExists(eventId);

        if (!this.eventRepository.gameRulesExists(data.gameRulesId)) {
            throw new GameRulesNotFoundError(data.gameRulesId);
        }

        const now = new Date();
        this.eventRepository.updateEvent({
            id: eventId,
            name: data.name,
            description: data.description ?? null,
            type: data.type,
            gameRules: data.gameRulesId,
            dateFrom: data.dateFrom ?? null,
            dateTo: data.dateTo ?? null,
            modifiedAt: now,
            modifiedBy
        });

        return this.getEventById(eventId);
    }

    deleteEvent(eventId: number): void {
        const event = this.validateEventExists(eventId);

        const gameCount = this.eventRepository.getGameCountForEvent(eventId);
        if (gameCount > 0) {
            throw new CannotDeleteEventWithGamesError(event.name, gameCount);
        }

        this.eventRepository.deleteEvent(eventId);
    }
}

export interface EventCreateData {
    name: string;
    description?: string | null | undefined;
    type: string;
    dateFrom?: Date | null | undefined;
    dateTo?: Date | null | undefined;
    gameRulesId: number;
}

export interface EventUpdateData {
    name: string;
    description?: string | null | undefined;
    type: string;
    dateFrom?: Date | null | undefined;
    dateTo?: Date | null | undefined;
    gameRulesId: number;
}
