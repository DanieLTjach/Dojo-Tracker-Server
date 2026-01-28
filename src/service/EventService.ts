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

    validateEventExists(eventId: number): void {
        const event = this.eventRepository.findEventById(eventId);
        if (!event) {
            throw new EventNotFoundError(eventId);
        }
    }

    createEvent(data: EventCreateData, modifiedBy: number): Event {
        // Validate game rules if provided
        if (data.gameRulesId && !this.eventRepository.gameRulesExists(data.gameRulesId)) {
            throw new GameRulesNotFoundError(data.gameRulesId);
        }

        const now = new Date().toISOString();
        const eventId = this.eventRepository.createEvent({
            name: data.name,
            description: data.description || null,
            type: data.type,
            gameRules: data.gameRulesId || 1, // Default to gameRulesId 1 if not provided
            dateFrom: data.dateFrom || null,
            dateTo: data.dateTo || null,
            createdAt: now,
            modifiedAt: now,
            modifiedBy
        });

        return this.getEventById(eventId);
    }

    updateEvent(eventId: number, data: EventUpdateData, modifiedBy: number): Event {
        // Validate event exists
        this.validateEventExists(eventId);

        // Validate game rules if being updated
        if (data.gameRulesId && !this.eventRepository.gameRulesExists(data.gameRulesId)) {
            throw new GameRulesNotFoundError(data.gameRulesId);
        }

        const now = new Date().toISOString();
        this.eventRepository.updateEvent({
            id: eventId,
            name: data.name,
            description: data.description,
            type: data.type,
            gameRules: data.gameRulesId,
            dateFrom: data.dateFrom,
            dateTo: data.dateTo,
            modifiedAt: now,
            modifiedBy
        });

        return this.getEventById(eventId);
    }

    deleteEvent(eventId: number): void {
        // Validate event exists
        this.validateEventExists(eventId);

        // Check if event has games
        const gameCount = this.eventRepository.getGameCountForEvent(eventId);
        if (gameCount > 0) {
            throw new CannotDeleteEventWithGamesError(eventId, gameCount);
        }

        this.eventRepository.deleteEvent(eventId);
    }
}

export interface EventCreateData {
    name: string;
    description?: string | undefined;
    type: string;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    gameRulesId?: number | undefined;
}

export interface EventUpdateData {
    name?: string | undefined;
    description?: string | undefined;
    type?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    gameRulesId?: number | undefined;
}
