import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ClubService } from '../service/ClubService.ts';
import { clubGetByIdSchema, clubCreateSchema, clubUpdateSchema, clubDeleteSchema } from '../schema/ClubSchemas.ts';

export class ClubController {
    private clubService: ClubService = new ClubService();

    getAllClubs(_req: Request, res: Response) {
        const clubs = this.clubService.getAllClubs();
        return res.status(StatusCodes.OK).json(clubs);
    }

    getClubById(req: Request, res: Response) {
        const { params: { clubId } } = clubGetByIdSchema.parse(req);
        const club = this.clubService.getClubById(clubId);
        return res.status(StatusCodes.OK).json(club);
    }

    createClub(req: Request, res: Response) {
        const { body } = clubCreateSchema.parse(req);
        const userId = req.user!.userId;
        const club = this.clubService.createClub(body, userId);
        return res.status(StatusCodes.CREATED).json(club);
    }

    updateClub(req: Request, res: Response) {
        const { params: { clubId }, body } = clubUpdateSchema.parse(req);
        const userId = req.user!.userId;
        const club = this.clubService.updateClub(clubId, body, userId);
        return res.status(StatusCodes.OK).json(club);
    }

    deleteClub(req: Request, res: Response) {
        const { params: { clubId } } = clubDeleteSchema.parse(req);
        const userId = req.user!.userId;
        this.clubService.deleteClub(clubId, userId);
        return res.status(StatusCodes.NO_CONTENT).send();
    }
}
