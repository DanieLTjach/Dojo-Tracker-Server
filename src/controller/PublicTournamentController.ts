import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { EventNotFoundError } from '../error/EventErrors.ts';
import { eventGetByIdSchema } from '../schema/EventSchemas.ts';
import { EventService } from '../service/EventService.ts';
import { ClubService } from '../service/ClubService.ts';
import { TeamService } from '../service/TeamService.ts';
import { EventRegistrationRepository } from '../repository/EventRegistrationRepository.ts';
import { EventFormat } from '../model/EventModels.ts';

export class PublicTournamentController {
    private eventService: EventService = new EventService();
    private clubService: ClubService = new ClubService();
    private teamService: TeamService = new TeamService();
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

        // Read-only team roster for public/embedded viewers of a team tournament.
        // The service DTO already nulls out hidden profile names, so it is safe to
        // expose. Non-team events return an empty list.
        const teams = event.format === EventFormat.TEAM
            ? this.teamService.listTeamsForEvent(eventId).map(team => ({
                id: team.id,
                name: team.name,
                members: team.members.map(member => ({
                    userId: member.userId,
                    name: member.name,
                    profileFirstName: member.profileFirstName,
                    profileLastName: member.profileLastName,
                    profileHidden: member.profileHidden,
                    role: member.role,
                })),
            }))
            : [];

        return res.status(StatusCodes.OK).json({ event, club, approvedCount, participants, teams });
    }
}
