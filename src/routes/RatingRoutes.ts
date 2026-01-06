import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { RatingController } from '../controller/RatingController.ts';

const router = Router();
const ratingController = new RatingController();

router.get(
    '/events/:eventId/rating',
    withTransaction((req, res) => ratingController.getAllUsersCurrentRating(req, res))
);
router.get(
    '/events/:eventId/rating/change',
    withTransaction((req, res) => ratingController.getAllUsersTotalRatingChangeDuringPeriod(req, res))
);
router.get(
    '/events/:eventId/users/:userId/rating/history',
    withTransaction((req, res) => ratingController.getUserRatingHistory(req, res))
);

export default router;