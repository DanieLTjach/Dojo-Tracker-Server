import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { RatingController } from '../controller/RatingController.ts';
import { requireAuth } from '../middleware/AuthMiddleware.ts';

const router = Router();
const ratingController = new RatingController();

router.get(
    '/events/:eventId/rating',
    requireAuth,
    withTransaction((req, res) => ratingController.getAllUsersCurrentRating(req, res))
);
router.get(
    '/events/:eventId/rating/change',
    requireAuth,
    withTransaction((req, res) => ratingController.getAllUsersTotalRatingChangeDuringPeriod(req, res))
);
router.get(
    '/events/:eventId/users/:userId/rating/history',
    requireAuth,
    withTransaction((req, res) => ratingController.getUserRatingHistory(req, res))
);

export default router;
