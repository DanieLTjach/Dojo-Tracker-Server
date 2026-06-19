import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { EventNotFoundError } from '../error/EventErrors.ts';
import { eventGetByIdSchema } from '../schema/EventSchemas.ts';
import { EventService } from '../service/EventService.ts';
import { ClubService } from '../service/ClubService.ts';
import { EventRegistrationRepository } from '../repository/EventRegistrationRepository.ts';

export class PublicTournamentController {
    private eventService: EventService = new EventService();
    private clubService: ClubService = new ClubService();
    private registrationRepository: EventRegistrationRepository = new EventRegistrationRepository();

    getPublicTournament(req: Request, res: Response) {
        const { params: { eventId } } = eventGetByIdSchema.parse(req);
        const event = this.eventService.getEventById(eventId);

        // Only TOURNAMENT events are exposed publicly — refuse to leak SEASON details.
        if (event.type !== 'TOURNAMENT') {
            throw new EventNotFoundError(eventId);
        }

        const club = event.clubId !== null ? this.clubService.getClubById(event.clubId) : null;
        const approved = this.registrationRepository.findRegistrationsByEventIdAndStatus(eventId, 'APPROVED');
        const participants = approved.map(registration => ({
            userId: registration.userId,
            userName: registration.userName,
            firstName: registration.hideProfile ? null : registration.firstName,
            lastName: registration.hideProfile ? null : registration.lastName,
            hideProfile: registration.hideProfile,
        }));
        const approvedCount = participants.length;

        return res.status(StatusCodes.OK).json({ event, club, approvedCount, participants });
    }
}
