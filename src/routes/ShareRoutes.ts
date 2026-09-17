import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { ShareController } from '../controller/ShareController.ts';

const router = Router();
const shareController = new ShareController();

/**
 * GET /share/posts/:id
 *
 * OpenGraph HTML endpoint for social crawlers (Telegram, Twitter, Discord, etc.).
 */
router.get(
    '/posts/:id',
    withTransaction((req, res) => shareController.getPostShareHtml(req, res))
);

/**
 * GET /share/users/:userId/achievements/:code
 *
 * OpenGraph HTML endpoint for unlocked achievements.
 */
router.get(
    '/users/:userId/achievements/:code',
    withTransaction((req, res) => shareController.getAchievementShareHtml(req, res))
);

export default router;
