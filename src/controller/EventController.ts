import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { EventService } from '../service/EventService.ts';
import { eventGetByIdSchema, eventCreateSchema, eventUpdateSchema, eventDeleteSchema } from '../schema/EventSchemas.ts';

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

    createEvent(req: Request, res: Response) {
        const { body } = eventCreateSchema.parse(req);
        const userId = req.user!.userId;
        const event = this.eventService.createEvent(body, userId);
        return res.status(StatusCodes.CREATED).json(event);
    }

    updateEvent(req: Request, res: Response) {
        const { params: { eventId }, body } = eventUpdateSchema.parse(req);
        const userId = req.user!.userId;
        const event = this.eventService.updateEvent(eventId, body, userId);
        return res.status(StatusCodes.OK).json(event);
    }

    deleteEvent(req: Request, res: Response) {
        const { params: { eventId } } = eventDeleteSchema.parse(req);
        this.eventService.deleteEvent(eventId);
        return res.status(StatusCodes.OK).json({ message: 'Event deleted successfully' });
    }
}
