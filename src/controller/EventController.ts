import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { EventService } from '../service/EventService.ts';
import { eventGetByIdSchema, eventCreateSchema, eventUpdateSchema, eventDeleteSchema, eventGetListSchema, eventTournamentUpdateSchema } from '../schema/EventSchemas.ts';

export class EventController {
    private eventService: EventService = new EventService();

    getAllEvents(req: Request, res: Response) {
        const { query } = eventGetListSchema.parse(req);
        const events = this.eventService.getAllEvents(query?.clubId);
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

    updateTournament(req: Request, res: Response) {
        const { params: { eventId }, body } = eventTournamentUpdateSchema.parse(req);
        const userId = req.user!.userId;
        const event = this.eventService.updateTournament(eventId, body, userId);
        return res.status(StatusCodes.OK).json(event);
    }

    startNextTournamentRound(req: Request, res: Response) {
        const { params: { eventId } } = eventGetByIdSchema.parse(req);
        const userId = req.user!.userId;
        const event = this.eventService.startNextTournamentRound(eventId, userId);
        return res.status(StatusCodes.OK).json(event);
    }

    finishTournament(req: Request, res: Response) {
        const { params: { eventId } } = eventGetByIdSchema.parse(req);
        const userId = req.user!.userId;
        const event = this.eventService.finishTournament(eventId, userId);
        return res.status(StatusCodes.OK).json(event);
    }

    deleteEvent(req: Request, res: Response) {
        const { params: { eventId } } = eventDeleteSchema.parse(req);
        const userId = req.user!.userId;
        this.eventService.deleteEvent(eventId, userId);
        return res.status(StatusCodes.NO_CONTENT).send();
    }
}
