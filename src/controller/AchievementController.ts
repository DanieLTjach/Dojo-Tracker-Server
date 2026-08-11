import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { AchievementService } from '../service/AchievementService.ts';
import { AutomaticAchievementService } from '../service/AutomaticAchievementService.ts';
import { UserService } from '../service/UserService.ts';
import { ClubMembershipService } from '../service/ClubMembershipService.ts';
import { InsufficientPermissionsError } from '../error/AuthErrors.ts';
import {
    clearEventAchievementsSchema,
    getEventAchievementsSchema,
    recomputeEventAchievementsSchema,
} from '../schema/EventSchemas.ts';
import { getUserAchievementsSchema } from '../schema/UserSchemas.ts';

export class AchievementController {
    private achievementService: AchievementService = new AchievementService();
    private automaticAchievementService: AutomaticAchievementService = new AutomaticAchievementService();
    private userService: UserService = new UserService();
    private clubMembershipService: ClubMembershipService = new ClubMembershipService();

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

    clearEventAchievements(req: Request, res: Response) {
        const { params: { eventId } } = clearEventAchievementsSchema.parse(req);
        this.achievementService.clearEventAchievements(eventId);
        return res.status(StatusCodes.NO_CONTENT).send();
    }

    getAutomaticCatalog(req: Request, res: Response) {
        const requestingUserId = req.user!.userId;
        const catalog = this.achievementService.getAutomaticCatalog(requestingUserId);
        return res.status(StatusCodes.OK).json({ catalog });
    }

    recomputeAutomaticAchievements(req: Request, res: Response) {
        const requestingUser = this.userService.getUserById(req.user!.userId);
        const { userId, clubId } = req.body ?? {};

        if (clubId !== undefined && clubId !== null) {
            const numClubId = Number(clubId);
            if (!requestingUser.isAdmin) {
                const role = this.clubMembershipService.getUserClubRole(numClubId, requestingUser.id);
                if (role !== 'OWNER' && role !== 'MODERATOR') {
                    throw new InsufficientPermissionsError();
                }
            }
            this.automaticAchievementService.recomputeClub(numClubId);
        } else if (userId !== undefined && userId !== null) {
            const numUserId = Number(userId);
            if (!requestingUser.isAdmin && requestingUser.id !== numUserId) {
                throw new InsufficientPermissionsError();
            }
            this.automaticAchievementService.recomputeUser(numUserId);
        } else {
            if (!requestingUser.isAdmin) {
                throw new InsufficientPermissionsError();
            }
            this.automaticAchievementService.recomputeAll();
        }

        return res.status(StatusCodes.OK).json({ message: 'Achievements recomputed successfully' });
    }

    getUserAchievements(req: Request, res: Response) {
        const { params: { id } } = getUserAchievementsSchema.parse(req);
        const requestingUserId = req.user!.userId;
        const result = this.achievementService.getUserProfileAchievements(id, requestingUserId);
        return res.status(StatusCodes.OK).json(result);
    }
}
