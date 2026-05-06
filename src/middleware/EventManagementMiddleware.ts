import type { Request, Response, NextFunction } from 'express';
import { MissingAuthTokenError } from '../error/AuthErrors.ts';
import { EventNotFoundError } from '../error/EventErrors.ts';
import { InsufficientEventManagementPermissionsError } from '../error/EventRegistrationErrors.ts';
import { ClubMembershipRepository } from '../repository/ClubMembershipRepository.ts';
import { EventRepository } from '../repository/EventRepository.ts';
import { UserService } from '../service/UserService.ts';

const membershipRepository = new ClubMembershipRepository();
const eventRepository = new EventRepository();
const userService = new UserService();

/**
 * Allows access if the requester is a system admin or an ACTIVE OWNER/MODERATOR
 * of the event's club.
 */
export const requireEventManagementRole = (req: Request, _res: Response, next: NextFunction): void => {
    try {
        if (!req.user) {
            throw new MissingAuthTokenError();
        }

        const user = userService.getUserById(req.user.userId);
        if (user.isAdmin) {
            next();
            return;
        }

        const eventId = Number(req.params['eventId']);
        const event = eventRepository.findEventById(eventId);
        if (!event) {
            throw new EventNotFoundError(eventId);
        }

        // event.clubId is nullable in the schema for legacy reasons but the
        // upcoming "remove global events" PR will tighten this. Guard defensively.
        if (event.clubId === null) {
            throw new InsufficientEventManagementPermissionsError();
        }

        const role = membershipRepository.getUserClubRole(event.clubId, req.user.userId);
        if (role !== 'OWNER' && role !== 'MODERATOR') {
            throw new InsufficientEventManagementPermissionsError();
        }

        next();
    } catch (error) {
        next(error);
    }
};
