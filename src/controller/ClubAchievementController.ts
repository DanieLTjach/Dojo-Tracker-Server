import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
    clubAchievementAssignSchema,
    clubAchievementCatalogArchiveSchema,
    clubAchievementCatalogCreateSchema,
    clubAchievementCatalogListSchema,
    clubAchievementRevokeSchema,
} from '../schema/ClubAchievementSchemas.ts';
import { ClubAchievementService } from '../service/ClubAchievementService.ts';

export class ClubAchievementController {
    private achievementService: ClubAchievementService = new ClubAchievementService();

    getCatalog(req: Request, res: Response) {
        const { params: { clubId } } = clubAchievementCatalogListSchema.parse(req);
        const catalog = this.achievementService.getCatalog(clubId);
        return res.status(StatusCodes.OK).json({ catalog });
    }

    createDefinition(req: Request, res: Response) {
        const { params: { clubId }, body: { name, description, icon } } = clubAchievementCatalogCreateSchema.parse(
            req
        );
        const createdBy = req.user!.userId;
        const definition = this.achievementService.createDefinition(
            clubId,
            name,
            description,
            icon ?? null,
            createdBy
        );
        return res.status(StatusCodes.CREATED).json(definition);
    }

    setArchived(req: Request, res: Response) {
        const { params: { clubId, definitionId }, body: { archived } } = clubAchievementCatalogArchiveSchema.parse(
            req
        );
        const modifiedBy = req.user!.userId;
        const definition = this.achievementService.setDefinitionArchived(
            clubId,
            definitionId,
            archived,
            modifiedBy
        );
        return res.status(StatusCodes.OK).json(definition);
    }

    assign(req: Request, res: Response) {
        const { params: { clubId, userId }, body: { builtInCode, definitionId, newDefinition, note } } =
            clubAchievementAssignSchema.parse(req);
        const awardedBy = req.user!.userId;
        const assignment = this.achievementService.assignAchievement(
            clubId,
            userId,
            {
                builtInCode,
                definitionId,
                newDefinition: newDefinition !== undefined
                    ? { ...newDefinition, icon: newDefinition.icon ?? null }
                    : undefined,
            },
            note ?? null,
            awardedBy
        );
        return res.status(StatusCodes.CREATED).json(assignment);
    }

    revoke(req: Request, res: Response) {
        const { params: { clubId, userId, assignmentId } } = clubAchievementRevokeSchema.parse(req);
        const revokedBy = req.user!.userId;
        const assignment = this.achievementService.revokeAssignment(clubId, userId, assignmentId, revokedBy);
        return res.status(StatusCodes.OK).json(assignment);
    }
}
