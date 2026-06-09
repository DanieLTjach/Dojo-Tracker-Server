import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { AchievementService } from '../service/AchievementService.ts';
import { getEventAchievementsSchema } from '../schema/EventSchemas.ts';
import { getUserAchievementsSchema } from '../schema/UserSchemas.ts';

export class AchievementController {
    private achievementService: AchievementService = new AchievementService();

    getEventAchievements(req: Request, res: Response) {
        const { params: { eventId } } = getEventAchievementsSchema.parse(req);
        const achievements = this.achievementService.getEventAchievements(eventId);
        return res.status(StatusCodes.OK).json({ achievements });
    }

    getUserAchievements(req: Request, res: Response) {
        const { params: { id } } = getUserAchievementsSchema.parse(req);
        const achievements = this.achievementService.getUserAchievements(id);
        return res.status(StatusCodes.OK).json({ achievements });
    }
}
