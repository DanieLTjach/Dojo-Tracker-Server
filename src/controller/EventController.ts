import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { EventService } from '../service/EventService.ts';
import { eventGetByIdSchema } from '../schema/EventSchemas.ts';

export class EventController {
    private eventService: EventService = new EventService();

    getAllEvents(_req: Request, res: Response) {
        const events = this.eventService.getAllEvents();
        return res.status(StatusCodes.OK).json(events);
    }

    getEventById(req: Request, res: Response) {
        const { params: { eventId } } = eventGetByIdSchema.parse(req);
        const event = this.eventService.getEventById(eventId);
        return res.status(StatusCodes.OK).json(event);
    }
}
