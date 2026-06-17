import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { EventService } from '../service/EventService.ts';
import { TournamentSeatingService } from '../service/TournamentSeatingService.ts';
import {
    eventGetByIdSchema,
    eventCreateSchema,
    eventUpdateSchema,
    eventDeleteSchema,
    eventGetListSchema,
    tournamentRoundStartSchema,
    tournamentSeatingGenerateSchema,
    tournamentSeatingApplySchema,
    tournamentSeatingClearSchema,
} from '../schema/EventSchemas.ts';

export class EventController {
    private eventService: EventService = new EventService();
    private tournamentSeatingService: TournamentSeatingService = new TournamentSeatingService();

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

    startTournamentRound(req: Request, res: Response) {
        const { params: { eventId, roundId } } = tournamentRoundStartSchema.parse(req);
        const userId = req.user!.userId;
        const event = this.eventService.startTournamentRound(eventId, roundId, userId);
        return res.status(StatusCodes.OK).json(event);
    }

    cancelTournamentRound(req: Request, res: Response) {
        const { params: { eventId, roundId } } = tournamentRoundStartSchema.parse(req);
        const userId = req.user!.userId;
        const event = this.eventService.cancelTournamentRound(eventId, roundId, userId);
        return res.status(StatusCodes.OK).json(event);
    }

    finishTournament(req: Request, res: Response) {
        const { params: { eventId } } = eventGetByIdSchema.parse(req);
        const userId = req.user!.userId;
        const event = this.eventService.finishTournament(eventId, userId);
        return res.status(StatusCodes.OK).json(event);
    }

    async generateTournamentSeating(req: Request, res: Response) {
        const { params: { eventId }, body } = tournamentSeatingGenerateSchema.parse(req);
        const userId = req.user!.userId;
        const result = await this.tournamentSeatingService.generateSeating(eventId, body ?? {}, userId);
        return res.status(StatusCodes.OK).json(result);
    }

    applyTournamentSeating(req: Request, res: Response) {
        const { params: { eventId }, body } = tournamentSeatingApplySchema.parse(req);
        const userId = req.user!.userId;
        const games = this.tournamentSeatingService.applySeating(eventId, body.rounds, userId);
        return res.status(StatusCodes.CREATED).json({ created: games.length, games });
    }

    clearTournamentSeating(req: Request, res: Response) {
        const { params: { eventId } } = tournamentSeatingClearSchema.parse(req);
        const userId = req.user!.userId;
        const result = this.tournamentSeatingService.clearSeating(eventId, userId);
        return res.status(StatusCodes.OK).json(result);
    }

    deleteEvent(req: Request, res: Response) {
        const { params: { eventId } } = eventDeleteSchema.parse(req);
        const userId = req.user!.userId;
        this.eventService.deleteEvent(eventId, userId);
        return res.status(StatusCodes.NO_CONTENT).send();
    }
}
