import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { getUserEventStatsSchema } from '../schema/UserStatsSchemas.ts';
import { UserStatsService } from '../service/UserStatsService.ts';

export class UserStatsController {
    private userStatsService: UserStatsService = new UserStatsService();

    getUserEventStats(req: Request, res: Response) {
        const {
            params: { userId, eventId },
        } = getUserEventStatsSchema.parse(req);
        const stats = this.userStatsService.getUserEventStats(userId, eventId);
        return res.status(StatusCodes.OK).json(stats);
    }
}
