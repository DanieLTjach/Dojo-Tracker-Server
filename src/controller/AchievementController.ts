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
import { recomputeAutomaticAchievementsSchema } from '../schema/ClubAchievementSchemas.ts';
import { getUserAchievementsSchema } from '../schema/UserSchemas.ts';
import { ACHIEVEMENT_CATEGORIES } from '../data/automaticAchievementCatalog.ts';

export class AchievementController {
    private achievementService: AchievementService = new AchievementService();
    private automaticAchievementService: AutomaticAchievementService = new AutomaticAchievementService();
    private userService: UserService = new UserService();
    private clubMembershipService: ClubMembershipService = new ClubMembershipService();

    getEventAchievements(req: Request, res: Response) {
        const { params: { eventId } } = getEventAchievementsSchema.parse(req);
        const userId = req.user!.userId;
        const result = this.achievementService.getEventAchievementsWithLifetimeUnlocks(eventId, userId);
        return res.status(StatusCodes.OK).json(result);
    }

    recomputeEventAchievements(req: Request, res: Response) {
        const { params: { eventId } } = recomputeEventAchievementsSchema.parse(req);
        const userId = req.user!.userId;
        this.achievementService.forceRecomputeEventAchievements(eventId, userId);
        const result = this.achievementService.getEventAchievementsWithLifetimeUnlocks(eventId, userId);
        return res.status(StatusCodes.OK).json(result);
    }

    clearEventAchievements(req: Request, res: Response) {
        const { params: { eventId } } = clearEventAchievementsSchema.parse(req);
        this.achievementService.clearEventAchievements(eventId);
        return res.status(StatusCodes.NO_CONTENT).send();
    }

    getAutomaticCatalog(req: Request, res: Response) {
        const requestingUserId = req.user!.userId;
        const catalog = this.achievementService.getAutomaticCatalog(requestingUserId);
        return res.status(StatusCodes.OK).json({ catalog, categories: ACHIEVEMENT_CATEGORIES });
    }

    recomputeAutomaticAchievements(req: Request, res: Response) {
        const { body } = recomputeAutomaticAchievementsSchema.parse(req);
        const requestingUser = this.userService.getUserById(req.user!.userId);
        const { userId, clubId } = body ?? {};

        if (clubId !== undefined) {
            if (!requestingUser.isAdmin) {
                const role = this.clubMembershipService.getUserClubRole(clubId, requestingUser.id);
                if (role !== 'OWNER' && role !== 'MODERATOR') {
                    throw new InsufficientPermissionsError();
                }
            }
            this.automaticAchievementService.recomputeClub(clubId);
        } else if (userId !== undefined) {
            if (!requestingUser.isAdmin && requestingUser.id !== userId) {
                throw new InsufficientPermissionsError();
            }
            this.automaticAchievementService.recomputeUser(userId);
        } else {
            if (!requestingUser.isAdmin) {
                throw new InsufficientPermissionsError();
            }
            this.automaticAchievementService.recomputeAll();
        }

        return res.status(StatusCodes.ACCEPTED).json({ message: 'Achievements recomputed successfully' });
    }

    getUserAchievements(req: Request, res: Response) {
        const { params: { id } } = getUserAchievementsSchema.parse(req);
        const requestingUserId = req.user!.userId;
        const result = this.achievementService.getUserProfileAchievements(id, requestingUserId);
        return res.status(StatusCodes.OK).json(result);
    }
}
