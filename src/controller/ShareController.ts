import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import config from '../../config/config.ts';
import { PostService } from '../service/PostService.ts';
import { AchievementService } from '../service/AchievementService.ts';
import { UserRepository } from '../repository/UserRepository.ts';
import { getPostByIdSchema } from '../schema/PostSchemas.ts';
import { publicAchievementSchema } from '../schema/AchievementSchemas.ts';
import { resolveRequestLocale } from '../util/LocaleResolver.ts';
import { escapeHtml } from '../util/TelegramHtmlUtil.ts';
import { UserNotFoundById } from '../error/UserErrors.ts';
import { AchievementNotFoundError } from '../error/AchievementErrors.ts';

function renderOpenGraphHtml(options: {
    title: string;
    description: string;
    imageUrl: string | null;
    canonicalUrl: string;
    type?: string;
}): string {
    const { title, description, imageUrl, canonicalUrl, type = 'article' } = options;
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    ${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : ''}
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    <meta property="og:type" content="${escapeHtml(type)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    ${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}">` : ''}
    <meta http-equiv="refresh" content="0;url=${escapeHtml(canonicalUrl)}">
</head>
<body>
    <p>Redirecting to <a href="${escapeHtml(canonicalUrl)}">${escapeHtml(title)}</a>...</p>
</body>
</html>`;
}

export class ShareController {
    private postService: PostService = new PostService();
    private achievementService: AchievementService = new AchievementService();
    private userRepository: UserRepository = new UserRepository();

    getPostShareHtml(req: Request, res: Response) {
        const { params: { id } } = getPostByIdSchema.parse(req);
        const post = this.postService.getPostById(id);

        const title = post.author.name
            ? `${post.author.name} on Riichi Dojo`
            : 'Post on Riichi Dojo';

        const textDesc = post.text?.trim();
        const description = textDesc
            ? (textDesc.length > 200 ? `${textDesc.slice(0, 197)}...` : textDesc)
            : 'Mahjong game results and achievements on Riichi Dojo';

        const imageUrl = post.images.length > 0
            ? post.images[0].url
            : (post.author.avatarUrl || null);

        const canonicalUrl = `${config.publicWebUrl}/posts/${post.id}`;

        const html = renderOpenGraphHtml({
            title,
            description,
            imageUrl,
            canonicalUrl,
            type: 'article',
        });

        return res.setHeader('Content-Type', 'text/html; charset=utf-8')
            .status(StatusCodes.OK)
            .send(html);
    }

    getAchievementShareHtml(req: Request, res: Response) {
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

        const title = `${user.name} unlocked ${achievement.name}`;
        const rawDesc = achievement.description || achievement.name;
        const description = rawDesc.length > 200 ? `${rawDesc.slice(0, 197)}...` : rawDesc;

        const rawImage = achievement.imageUrl ?? achievement.icon;
        const imageUrl = rawImage
            ? (rawImage.startsWith('http') ? rawImage : `${config.publicWebUrl}${rawImage}`)
            : null;

        const canonicalUrl = `${config.publicWebUrl}/users/${userId}/achievements/${code}`;

        const html = renderOpenGraphHtml({
            title,
            description,
            imageUrl,
            canonicalUrl,
            type: 'article',
        });

        return res.setHeader('Content-Type', 'text/html; charset=utf-8')
            .status(StatusCodes.OK)
            .send(html);
    }
}
