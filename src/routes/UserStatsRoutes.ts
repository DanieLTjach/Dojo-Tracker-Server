import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { UserStatsController } from '../controller/UserStatsController.ts';
import { requireAuth } from '../middleware/AuthMiddleware.ts';

const router = Router();
const userStatsController = new UserStatsController();

/**
 * GET /api/events/:eventId/users/:userId/stats
 * Get comprehensive statistics for a user in a specific event
 *
 * Authentication: Required
 */
router.get(
    '/:eventId/users/:userId/stats',
    requireAuth,
    withTransaction((req, res) => userStatsController.getUserEventStats(req, res))
);

export default router;
