import { EventNotFoundError, GameRulesNotFoundError, CannotDeleteEventWithGamesError } from '../error/EventErrors.ts';
import { ClubNotFoundError } from '../error/ClubErrors.ts';
import type { Event } from '../model/EventModels.ts';
import { ClubRepository } from '../repository/ClubRepository.ts';
import { EventRepository } from '../repository/EventRepository.ts';

export class EventService {
    private eventRepository: EventRepository = new EventRepository();
    private clubRepository: ClubRepository = new ClubRepository();

    getAllEvents(clubId?: number): Event[] {
        if (clubId !== undefined) {
            return this.eventRepository.findAllEventsByClubId(clubId);
        }
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

    createEvent(data: EventData, modifiedBy: number): Event {
        if (!this.eventRepository.gameRulesExists(data.gameRulesId)) {
            throw new GameRulesNotFoundError(data.gameRulesId);
        }

        if (data.clubId !== null && data.clubId !== undefined && !this.clubRepository.clubExists(data.clubId)) {
            throw new ClubNotFoundError(data.clubId);
        }

        const now = new Date();
        const eventId = this.eventRepository.createEvent({
            name: data.name,
            description: data.description ?? null,
            type: data.type,
            gameRules: data.gameRulesId,
            clubId: data.clubId ?? null,
            dateFrom: data.dateFrom ?? null,
            dateTo: data.dateTo ?? null,
            createdAt: now,
            modifiedAt: now,
            modifiedBy
        });

        return this.getEventById(eventId);
    }

    updateEvent(eventId: number, data: EventData, modifiedBy: number): Event {
        this.validateEventExists(eventId);

        if (!this.eventRepository.gameRulesExists(data.gameRulesId)) {
            throw new GameRulesNotFoundError(data.gameRulesId);
        }

        if (data.clubId !== null && data.clubId !== undefined && !this.clubRepository.clubExists(data.clubId)) {
            throw new ClubNotFoundError(data.clubId);
        }

        const now = new Date();
        this.eventRepository.updateEvent({
            id: eventId,
            name: data.name,
            description: data.description ?? null,
            type: data.type,
            gameRules: data.gameRulesId,
            clubId: data.clubId ?? null,
            dateFrom: data.dateFrom ?? null,
            dateTo: data.dateTo ?? null,
            modifiedAt: now,
            modifiedBy
        });

        return this.getEventById(eventId);
    }

    deleteEvent(eventId: number): void {
        const event = this.getEventById(eventId);

        const gameCount = this.eventRepository.getGameCountForEvent(eventId);
        if (gameCount > 0) {
            throw new CannotDeleteEventWithGamesError(event.name, gameCount);
        }

        this.eventRepository.deleteEvent(eventId);
    }
}

export interface EventData {
    name: string;
    description?: string | null | undefined;
    type: string;
    clubId?: number | null | undefined;
    dateFrom?: Date | null | undefined;
    dateTo?: Date | null | undefined;
    gameRulesId: number;
}
