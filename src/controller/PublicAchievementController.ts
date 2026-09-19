import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { AchievementService } from '../service/AchievementService.ts';
import { UserRepository } from '../repository/UserRepository.ts';
import { publicAchievementSchema } from '../schema/AchievementSchemas.ts';
import { resolveRequestLocale } from '../util/LocaleResolver.ts';
import { UserNotFoundById } from '../error/UserErrors.ts';
import { AchievementNotFoundError } from '../error/AchievementErrors.ts';

export class PublicAchievementController {
    private achievementService: AchievementService = new AchievementService();
    private userRepository: UserRepository = new UserRepository();

    getPublicUserAchievement(req: Request, res: Response) {
        const { params: { userId, code } } = publicAchievementSchema.parse(req);
        const locale = resolveRequestLocale(req);

        const user = this.userRepository.findUserById(userId);
        if (!user || user.profile?.hideProfile) {
            throw new UserNotFoundById(userId);
        }

        const achievement = this.achievementService.getPublicUserAchievement(userId, code, locale);
        if (!achievement) {
            throw new AchievementNotFoundError(code);
        }

        return res.status(StatusCodes.OK).json({
            achievement: {
                code: achievement.code,
                name: achievement.name,
                description: achievement.description,
                imageUrl: achievement.imageUrl ?? achievement.icon ?? null,
                category: achievement.category ?? 'CAREER',
                awardedAt: achievement.awardedAt,
                value: achievement.value,
                valueFormatted: achievement.valueFormatted,
            },
            user: {
                id: user.id,
                name: user.name,
                avatarUrl: user.profile?.avatarUrl ?? null,
            },
        });
    }
}
