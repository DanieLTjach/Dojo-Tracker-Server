import {
    EventNotFoundError,
    GameRulesNotFoundError,
    CannotDeleteEventWithGamesError,
    CurrentRatingEventMustBeClubScopedError,
    CurrentRatingEventMustBeSeasonError
} from '../error/EventErrors.ts';
import { ClubNotFoundError, InsufficientClubPermissionsError } from '../error/ClubErrors.ts';
import { InsufficientPermissionsError } from '../error/AuthErrors.ts';
import type { Event } from '../model/EventModels.ts';
import { ClubRepository } from '../repository/ClubRepository.ts';
import { EventRepository } from '../repository/EventRepository.ts';
import { ClubMembershipRepository } from '../repository/ClubMembershipRepository.ts';
import { UserService } from './UserService.ts';

export class EventService {
    private eventRepository: EventRepository = new EventRepository();
    private clubRepository: ClubRepository = new ClubRepository();
    private membershipRepository: ClubMembershipRepository = new ClubMembershipRepository();
    private userService: UserService = new UserService();

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
        this.authorizeEventCreation(data.clubId, modifiedBy);

        if (!this.eventRepository.gameRulesExists(data.gameRulesId)) {
            throw new GameRulesNotFoundError(data.gameRulesId);
        }

        if (data.clubId !== null && data.clubId !== undefined && !this.clubRepository.clubExists(data.clubId)) {
            throw new ClubNotFoundError(data.clubId!);
        }

        this.validateCurrentRatingEvent(data);

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

        this.syncCurrentRatingEvent(undefined, {
            ...data,
            clubId: data.clubId ?? null,
            isCurrentRating: data.isCurrentRating ?? false
        }, eventId, modifiedBy, now);

        return this.getEventById(eventId);
    }

    updateEvent(eventId: number, data: EventData, modifiedBy: number): Event {
        const existingEvent = this.getEventById(eventId);
        this.authorizeEventUpdate(existingEvent, data.clubId, modifiedBy);

        if (!this.eventRepository.gameRulesExists(data.gameRulesId)) {
            throw new GameRulesNotFoundError(data.gameRulesId);
        }

        if (data.clubId !== null && data.clubId !== undefined && !this.clubRepository.clubExists(data.clubId)) {
            throw new ClubNotFoundError(data.clubId!);
        }

        this.validateCurrentRatingEvent(data);

        const now = new Date();
        this.syncCurrentRatingEvent(existingEvent, {
            ...data,
            clubId: data.clubId ?? null,
            isCurrentRating: data.isCurrentRating ?? false
        }, eventId, modifiedBy, now);

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

    private authorizeEventCreation(clubId: number | null | undefined, userId: number): void {
        const user = this.userService.getUserById(userId);
        if (user.isAdmin) {
            return;
        }

        if (clubId === null || clubId === undefined) {
            throw new InsufficientPermissionsError();
        }

        const clubRole = this.membershipRepository.getUserClubRole(clubId, userId);
        if (clubRole !== 'OWNER') {
            throw new InsufficientClubPermissionsError('OWNER');
        }
    }

    private authorizeEventUpdate(existingEvent: Event, requestedClubId: number | null | undefined, userId: number): void {
        const user = this.userService.getUserById(userId);
        if (user.isAdmin) {
            return;
        }

        if (existingEvent.clubId === null) {
            throw new InsufficientPermissionsError();
        }

        const clubRole = this.membershipRepository.getUserClubRole(existingEvent.clubId, userId);
        if (clubRole !== 'OWNER') {
            throw new InsufficientClubPermissionsError('OWNER');
        }

        if (requestedClubId !== existingEvent.clubId) {
            throw new InsufficientPermissionsError();
        }
    }

    deleteEvent(eventId: number): void {
        const event = this.getEventById(eventId);

        const gameCount = this.eventRepository.getGameCountForEvent(eventId);
        if (gameCount > 0) {
            throw new CannotDeleteEventWithGamesError(event.name, gameCount);
        }

        this.eventRepository.deleteEvent(eventId);
    }

    private validateCurrentRatingEvent(data: EventData): void {
        if (!data.isCurrentRating) {
            return;
        }

        if (data.clubId === null || data.clubId === undefined) {
            throw new CurrentRatingEventMustBeClubScopedError();
        }

        if (data.type !== 'SEASON') {
            throw new CurrentRatingEventMustBeSeasonError();
        }
    }

    private syncCurrentRatingEvent(
        existingEvent: Event | undefined,
        nextEventData: Required<Pick<EventData, 'clubId' | 'isCurrentRating'>>,
        eventId: number,
        modifiedBy: number,
        modifiedAt: Date
    ): void {
        if (existingEvent?.clubId !== null && existingEvent?.clubId !== undefined && existingEvent.isCurrentRating) {
            const clubStillPointsToThisEvent = existingEvent.clubId !== nextEventData.clubId || !nextEventData.isCurrentRating;
            if (clubStillPointsToThisEvent) {
                this.clubRepository.updateCurrentRatingEvent(existingEvent.clubId, null, modifiedAt, modifiedBy);
            }
        }

        if (nextEventData.isCurrentRating && nextEventData.clubId !== null && nextEventData.clubId !== undefined) {
            this.clubRepository.updateCurrentRatingEvent(nextEventData.clubId, eventId, modifiedAt, modifiedBy);
        }
    }
}

export interface EventData {
    name: string;
    description?: string | null | undefined;
    type: string;
    clubId?: number | null | undefined;
    isCurrentRating?: boolean | null | undefined;
    dateFrom?: Date | null | undefined;
    dateTo?: Date | null | undefined;
    gameRulesId: number;
}
