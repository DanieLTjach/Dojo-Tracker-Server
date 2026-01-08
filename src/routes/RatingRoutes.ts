import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { RatingController } from '../controller/RatingController.ts';
import { requireAuth } from '../middleware/AuthMiddleware.ts';

const router = Router();
const ratingController = new RatingController();

/**
 * GET /api/events/:eventId/rating
 * Get current ratings for all users in an event
 *
 * Authentication: Required
 */
router.get(
    '/:eventId/rating',
    requireAuth,
    withTransaction((req, res) => ratingController.getAllUsersCurrentRating(req, res))
);

/**
 * GET /api/events/:eventId/rating/change
 * Get total rating changes for all users during a time period
 * Query params: dateFrom (ISO date), dateTo (ISO date)
 *
 * Authentication: Required
 */
router.get(
    '/:eventId/rating/change',
    requireAuth,
    withTransaction((req, res) => ratingController.getAllUsersTotalRatingChangeDuringPeriod(req, res))
);

/**
 * GET /api/events/:eventId/users/:userId/rating/history
 * Get rating history for a specific user in an event
 *
 * Authentication: Required
 */
router.get(
    '/:eventId/users/:userId/rating/history',
    requireAuth,
    withTransaction((req, res) => ratingController.getUserRatingHistory(req, res))
);

export default router;
