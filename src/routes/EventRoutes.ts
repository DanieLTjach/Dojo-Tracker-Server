import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { EventController } from '../controller/EventController.ts';
import { requireAuth } from '../middleware/AuthMiddleware.ts';

const router = Router();
const eventController = new EventController();

/**
 * GET /api/events/:eventId
 * Get event details by ID
 *
 * Authentication: Required
 */
router.get(
    '/:eventId',
    requireAuth,
    withTransaction((req, res) => eventController.getEventById(req, res))
);

export default router;
