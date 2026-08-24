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

import { UserService } from '../service/UserService.ts';
import { resolveUserLocale } from '../util/LocaleResolver.ts';
import type { SupportedLocale } from '../i18n/index.ts';
import { AchievementMediaService } from '../service/AchievementMediaService.ts';

export class ClubAchievementController {
    private achievementService: ClubAchievementService = new ClubAchievementService();
    private achievementMediaService: AchievementMediaService = new AchievementMediaService();
    private userService: UserService = new UserService();

    setMediaService(service: AchievementMediaService) {
        this.achievementMediaService = service;
    }

    async uploadIcon(req: Request, res: Response) {
        const clubId = Number(req.params['clubId']);
        if (isNaN(clubId) || !Number.isInteger(clubId) || clubId <= 0) {
            return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid club ID' });
        }
        const modifiedBy = req.user!.userId;
        const file = req.file || (Array.isArray(req.files) ? req.files[0] : undefined);
        const result = await this.achievementMediaService.uploadClubAchievementIcon(
            clubId,
            file?.buffer,
            modifiedBy
        );
        return res.status(StatusCodes.OK).json(result);
    }

    getCatalog(req: Request, res: Response) {
        const { params: { clubId } } = clubAchievementCatalogListSchema.parse(req);
        let locale: SupportedLocale = 'en';
        if (req.user?.userId !== undefined) {
            try {
                const requestingUser = this.userService.getUserById(req.user.userId);
                locale = resolveUserLocale(requestingUser);
            } catch (err) {
                locale = 'en';
            }
        }
        const catalog = this.achievementService.getFullCatalog(clubId, locale);
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
