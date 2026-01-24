import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { EventController } from '../controller/EventController.ts';
import { requireAuth, requireAdmin } from '../middleware/AuthMiddleware.ts';

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
 * Get event by ID (includes game rules)
 *
 * Authentication: Required
 */
router.get('/:eventId', requireAuth, withTransaction((req, res) => eventController.getEventById(req, res)));

/**
 * POST /api/events
 * Create a new event
 *
 * Authentication: Required (Admin only)
 */
router.post('/', requireAuth, requireAdmin, withTransaction((req, res) => eventController.createEvent(req, res)));

/**
 * PUT /api/events/:eventId
 * Update an existing event
 *
 * Authentication: Required (Admin only)
 */
router.put('/:eventId', requireAuth, requireAdmin, withTransaction((req, res) => eventController.updateEvent(req, res)));

/**
 * DELETE /api/events/:eventId
 * Delete an event (only if it has no games)
 *
 * Authentication: Required (Admin only)
 */
router.delete('/:eventId', requireAuth, requireAdmin, withTransaction((req, res) => eventController.deleteEvent(req, res)));

export default router;
