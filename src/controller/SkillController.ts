import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
    getClubSkillLeaderboardSchema,
    getUserSkillSchema,
    recomputeAdminSkillSchema,
    recomputeClubSkillSchema,
    updateClubSkillConfigSchema,
} from '../schema/SkillSchemas.ts';
import { SkillRatingService } from '../service/SkillRatingService.ts';

export class SkillController {
    private skillRatingService: SkillRatingService;

    constructor(skillRatingService = new SkillRatingService()) {
        this.skillRatingService = skillRatingService;
    }

    getUserSkill(req: Request, res: Response) {
        const { params: { userId } } = getUserSkillSchema.parse(req);
        const result = this.skillRatingService.getUserSkillAcrossClubs(userId);
        return res.status(StatusCodes.OK).json(result);
    }

    getClubSkillLeaderboard(req: Request, res: Response) {
        const {
            params: { clubId },
            query: { gameSize },
        } = getClubSkillLeaderboardSchema.parse(req);
        const leaderboard = this.skillRatingService.getClubLeaderboard(clubId, gameSize);
        return res.status(StatusCodes.OK).json(leaderboard);
    }

    recomputeClubSkill(req: Request, res: Response) {
        const {
            params: { clubId },
            query: { gameSize },
        } = recomputeClubSkillSchema.parse(req);

        let result;
        if (gameSize !== undefined) {
            result = this.skillRatingService.recomputeTrack(clubId, gameSize);
        } else {
            result = this.skillRatingService.recomputeClub(clubId);
        }

        return res.status(StatusCodes.OK).json(result);
    }

    recomputeAdminSkill(req: Request, res: Response) {
        const {
            query: { clubId, gameSize },
        } = recomputeAdminSkillSchema.parse(req);

        let result;
        if (clubId !== undefined && gameSize !== undefined) {
            result = this.skillRatingService.recomputeTrack(clubId, gameSize);
        } else if (clubId !== undefined) {
            result = this.skillRatingService.recomputeClub(clubId);
        } else {
            result = this.skillRatingService.recomputeAll();
        }

        return res.status(StatusCodes.OK).json(result);
    }

    updateClubSkillConfig(req: Request, res: Response) {
        const {
            params: { clubId },
            body: { provisionalGameThreshold, isEnabled },
        } = updateClubSkillConfigSchema.parse(req);

        const currentUserId = req.user?.userId ?? 0;
        const updated = this.skillRatingService.updateConfig(
            clubId,
            provisionalGameThreshold,
            isEnabled,
            currentUserId
        );

        return res.status(StatusCodes.OK).json(updated);
    }
}
