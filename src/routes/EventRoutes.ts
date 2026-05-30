import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { EventController } from '../controller/EventController.ts';
import { EventRegistrationController } from '../controller/EventRegistrationController.ts';
import { requireAuth } from '../middleware/AuthMiddleware.ts';
import {
    requireEventManagementRole,
    requireEventManagementRoleOrApprovedFilter
} from '../middleware/EventManagementMiddleware.ts';

const router = Router();
const eventController = new EventController();
const registrationController = new EventRegistrationController();

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
router.post('/', requireAuth, withTransaction((req, res) => eventController.createEvent(req, res)));

/**
 * PUT /api/events/:eventId
 * Update an existing event
 *
 * Authentication: Required (Admin only)
 */
router.put('/:eventId', requireAuth, withTransaction((req, res) => eventController.updateEvent(req, res)));

/**
 * PATCH /api/events/:eventId/tournament
 * Update tournament settings for an event
 *
 * Authentication: Required (Admin or Club Owner)
 */
router.patch('/:eventId/tournament', requireAuth, withTransaction((req, res) => eventController.updateTournament(req, res)));

/**
 * POST /api/events/:eventId/tournament/start-next-round
 * Advance tournament state to the next prepared round
 *
 * Authentication: Required (Admin, Club Owner, or Club Moderator)
 */
router.post('/:eventId/tournament/start-next-round', requireAuth, withTransaction((req, res) => eventController.startNextTournamentRound(req, res)));

/**
 * POST /api/events/:eventId/tournament/finish
 * Finish a tournament after its final round games are complete
 *
 * Authentication: Required (Admin, Club Owner, or Club Moderator)
 */
router.post('/:eventId/tournament/finish', requireAuth, withTransaction((req, res) => eventController.finishTournament(req, res)));

/**
 * DELETE /api/events/:eventId
 * Delete an event (only if it has no games)
 *
 * Authentication: Required (Admin or Club Owner)
 */
router.delete('/:eventId', requireAuth, withTransaction((req, res) => eventController.deleteEvent(req, res)));

// Tournament registrations (only valid for events with type='TOURNAMENT')
router.post(
    '/:eventId/register',
    requireAuth,
    withTransaction((req, res) => registrationController.apply(req, res))
);
router.post(
    '/:eventId/withdraw',
    requireAuth,
    withTransaction((req, res) => registrationController.withdraw(req, res))
);
router.get(
    '/:eventId/registrations',
    requireAuth,
    requireEventManagementRoleOrApprovedFilter,
    withTransaction((req, res) => registrationController.listForEvent(req, res))
);
router.post(
    '/:eventId/registrations/:userId/approve',
    requireAuth,
    requireEventManagementRole,
    withTransaction((req, res) => registrationController.approve(req, res))
);
router.post(
    '/:eventId/registrations/:userId/reject',
    requireAuth,
    requireEventManagementRole,
    withTransaction((req, res) => registrationController.reject(req, res))
);
router.post(
    '/:eventId/registrations/:userId/manual',
    requireAuth,
    requireEventManagementRole,
    withTransaction((req, res) => registrationController.manualRegister(req, res))
);
router.patch(
    '/:eventId/registrations/:userId/profile',
    requireAuth,
    requireEventManagementRole,
    withTransaction((req, res) => registrationController.editParticipantProfileNames(req, res))
);
router.patch(
    '/:eventId/registrations/:userId/filler-player',
    requireAuth,
    requireEventManagementRole,
    withTransaction((req, res) => registrationController.setFillerPlayer(req, res))
);

export default router;
