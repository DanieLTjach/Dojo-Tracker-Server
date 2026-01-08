import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { EventService } from '../service/EventService.ts';

export class EventController {

    private eventService: EventService = new EventService();

    getEventById(req: Request, res: Response) {
        const eventId = parseInt(req.params.eventId);

        if (isNaN(eventId)) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                error: 'Invalid request data',
                message: 'Event ID must be a number'
            });
        }

        // This will throw EventNotFoundError if event doesn't exist
        this.eventService.validateEventExists(eventId);

        // For now, just return success - we'll add full event retrieval later
        return res.status(StatusCodes.OK).json({
            id: eventId,
            message: 'Event exists'
        });
    }
}
