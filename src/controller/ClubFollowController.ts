import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { clubFollowSchema } from '../schema/ClubSchemas.ts';
import { ClubFollowService } from '../service/ClubFollowService.ts';

export class ClubFollowController {
    private followService: ClubFollowService = new ClubFollowService();

    followClub(req: Request, res: Response) {
        const { params: { clubId } } = clubFollowSchema.parse(req);
        const userId = req.user!.userId;
        this.followService.followClub(clubId, userId);
        return res.status(StatusCodes.NO_CONTENT).send();
    }

    unfollowClub(req: Request, res: Response) {
        const { params: { clubId } } = clubFollowSchema.parse(req);
        const userId = req.user!.userId;
        this.followService.unfollowClub(clubId, userId);
        return res.status(StatusCodes.NO_CONTENT).send();
    }

    getCurrentUserFollowedClubs(req: Request, res: Response) {
        const userId = req.user!.userId;
        const clubs = this.followService.getFollowedClubsForUser(userId);
        return res.status(StatusCodes.OK).json(clubs);
    }
}
