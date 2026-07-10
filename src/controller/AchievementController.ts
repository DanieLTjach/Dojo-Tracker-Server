import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { AchievementService } from '../service/AchievementService.ts';
import { getEventAchievementsSchema, recomputeEventAchievementsSchema } from '../schema/EventSchemas.ts';
import { getUserAchievementsSchema } from '../schema/UserSchemas.ts';

export class AchievementController {
    private achievementService: AchievementService = new AchievementService();

    getEventAchievements(req: Request, res: Response) {
        const { params: { eventId } } = getEventAchievementsSchema.parse(req);
        const userId = req.user!.userId;
        const achievements = this.achievementService.getEventAchievements(eventId, userId);
        return res.status(StatusCodes.OK).json({ achievements });
    }

    recomputeEventAchievements(req: Request, res: Response) {
        const { params: { eventId } } = recomputeEventAchievementsSchema.parse(req);
        const userId = req.user!.userId;
        const achievements = this.achievementService.forceRecomputeEventAchievements(eventId, userId);
        return res.status(StatusCodes.OK).json({ achievements });
    }

    getUserAchievements(req: Request, res: Response) {
        const { params: { id } } = getUserAchievementsSchema.parse(req);
        const requestingUserId = req.user!.userId;
        const achievements = this.achievementService.getUserAchievements(id, requestingUserId);
        return res.status(StatusCodes.OK).json({ achievements });
    }
}
