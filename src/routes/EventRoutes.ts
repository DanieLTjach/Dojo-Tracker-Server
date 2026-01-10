import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { EventController } from '../controller/EventController.ts';
import { requireAuth } from '../middleware/AuthMiddleware.ts';

const router = Router();
const eventController = new EventController();

/**
 * GET /api/events
 * Get all events
 *
 * Authentication: Required
 */
router.get('/', requireAuth, withTransaction((req, res) => eventController.getAllEvents(req, res)));

/**
 * GET /api/events/:eventId
 * Get event by ID
 *
 * Authentication: Required
 */
router.get('/:eventId', requireAuth, withTransaction((req, res) => eventController.getEventById(req, res)));

/**
 * GET /api/events/:eventId/game-rules
 * Get game rules for a specific event
 *
 * Authentication: Required
 */
router.get(
    '/:eventId/game-rules',
    requireAuth,
    withTransaction((req, res) => eventController.getGameRulesByEventId(req, res))
);

export default router;
