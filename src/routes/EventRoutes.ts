import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { EventController } from '../controller/EventController.ts';
import { EventRegistrationController } from '../controller/EventRegistrationController.ts';
import { AchievementController } from '../controller/AchievementController.ts';
import { TeamController } from '../controller/TeamController.ts';
import { requireAuth, requireAdmin } from '../middleware/AuthMiddleware.ts';
import {
    requireEventManagementRole,
    requireEventManagementRoleOrApprovedFilter,
} from '../middleware/EventManagementMiddleware.ts';
import { createCharge, withUsageTransaction } from '../middleware/UsageMiddleware.ts';
import { UsageAction } from '../model/UsageModels.ts';
import { EventService } from '../service/EventService.ts';

const router = Router();
const eventController = new EventController();
const registrationController = new EventRegistrationController();
const achievementController = new AchievementController();
const usageEventService = new EventService();
const teamController = new TeamController();

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
 * GET /api/events/:eventId/achievements
 * Per-tournament achievements (winners + values) for the tournament page
 *
 * Authentication: Required
 */
router.get(
    '/:eventId/achievements',
    requireAuth,
    withTransaction((req, res) => achievementController.getEventAchievements(req, res))
);

/**
 * POST /api/events/:eventId/achievements/recompute
 * Force recompute of a tournament's achievements (e.g. after fixing bad data)
 *
 * Authentication: Required (Admin only)
 */
router.post(
    '/:eventId/achievements/recompute',
    requireAuth,
    requireAdmin,
    withTransaction((req, res) => achievementController.recomputeEventAchievements(req, res))
);

/**
 * POST /api/events
 * Create a new event
 *
 * Authentication: Required (Admin only)
 */
router.post(
    '/',
    requireAuth,
    withTransaction((req, res) => eventController.createEvent(req, res))
);

/**
 * PUT /api/events/:eventId
 * Update an existing event
 *
 * Authentication: Required (Admin only)
 */
router.put('/:eventId', requireAuth, withTransaction((req, res) => eventController.updateEvent(req, res)));

/**
 * PATCH /api/events/:eventId
 * Partially update an event. Only the provided fields change; `info` is merged one level
 * deep (patching `venue` keeps `schedule`/`links`). The merged result is
 * validated exactly like a full PUT.
 *
 * Authentication: Required (Admin or Club Owner — same as PUT)
 */
router.patch('/:eventId', requireAuth, withTransaction((req, res) => eventController.patchEvent(req, res)));

/**
 * POST /api/events/:eventId/tournament/rounds/:roundId/start
 * Advance tournament state to the given round. Idempotent: including the round id makes a
 * duplicated request (double tap, retry on bad network) a no-op instead of skipping a round.
 *
 * Authentication: Required (Admin, Club Owner, or Club Moderator)
 */
router.post(
    '/:eventId/tournament/rounds/:roundId/start',
    requireAuth,
    withTransaction((req, res) => eventController.startTournamentRound(req, res))
);

/**
 * POST /api/events/:eventId/tournament/rounds/:roundId/cancel
 * Cancel (undo) the start of the current tournament round, stepping currentRound back one step.
 * Only allowed for the round that is currently active and while none of its games have been played
 * yet (all still CREATED). Lets a moderator roll back an accidental start or regenerate seating.
 *
 * Authentication: Required (Admin, Club Owner, or Club Moderator)
 */
router.post(
    '/:eventId/tournament/rounds/:roundId/cancel',
    requireAuth,
    withTransaction((req, res) => eventController.cancelTournamentRound(req, res))
);

/**
 * POST /api/events/:eventId/tournament/finish
 * Finish a tournament after its final round games are complete
 *
 * Authentication: Required (Admin, Club Owner, or Club Moderator)
 */
router.post(
    '/:eventId/tournament/finish',
    requireAuth,
    withTransaction((req, res) => eventController.finishTournament(req, res))
);

/**
 * POST /api/events/:eventId/tournament/seating/generate
 * Generate candidate seatings from the tournament's approved participants and round count.
 * Does not persist — returns options for a moderator to choose from.
 *
 * Authentication: Required (Admin, Club Owner, or Club Moderator)
 */
// Read-only and CPU-bound (runs in a worker thread): no DB transaction, handled asynchronously.
router.post(
    '/:eventId/tournament/seating/generate',
    requireAuth,
    (req, res, next) => {
        eventController.generateTournamentSeating(req, res).catch(next);
    }
);

/**
 * POST /api/events/:eventId/tournament/seating/apply
 * Persist a chosen seating by creating CREATED tournament games (only before start, clean slate).
 *
 * Authentication: Required (Admin, Club Owner, or Club Moderator)
 */
router.post(
    '/:eventId/tournament/seating/apply',
    requireAuth,
    withUsageTransaction(
        req =>
            chargeForExistingEvent(
                req.params['eventId'],
                UsageAction.TOURNAMENT_SEATING_APPLIED,
                req.user!.userId,
                countSeatingGames(req.body?.rounds)
            ),
        (req, res) => eventController.applyTournamentSeating(req, res)
    )
);

/**
 * DELETE /api/events/:eventId/tournament/seating
 * Delete all generated tournament games so a new seating can be produced (only before start).
 *
 * Authentication: Required (Admin, Club Owner, or Club Moderator)
 */
router.delete(
    '/:eventId/tournament/seating',
    requireAuth,
    withTransaction((req, res) => eventController.clearTournamentSeating(req, res))
);

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

function chargeForExistingEvent(eventIdValue: unknown, action: UsageAction, modifiedBy: number, count?: number) {
    const eventId = Number(eventIdValue);
    if (!Number.isInteger(eventId)) {
        return undefined;
    }
    try {
        const event = usageEventService.getEventById(eventId);
        return createCharge(event.clubId, action, modifiedBy, count);
    } catch {
        return undefined;
    }
}

function countSeatingGames(rounds: unknown): number | undefined {
    if (!Array.isArray(rounds)) {
        return undefined;
    }
    const count = rounds.reduce((sum, round) => sum + (Array.isArray(round) ? round.length : 0), 0);
    return count > 0 ? count : undefined;
}

// Teams (only valid for events with a team format). The captain-vs-manager
// authorization split is enforced inside TeamService; manager-only actions
// (close registration / start draft) additionally use requireEventManagementRole.
// Static sub-paths are declared before the ':teamId' param route so they aren't
// captured as a team id.
router.get(
    '/:eventId/teams',
    requireAuth,
    withTransaction((req, res) => teamController.list(req, res))
);
router.get(
    '/:eventId/teams/available-players',
    requireAuth,
    withTransaction((req, res) => teamController.availablePlayers(req, res))
);
router.get(
    '/:eventId/teams/standings',
    requireAuth,
    withTransaction((req, res) => teamController.standings(req, res))
);
router.post(
    '/:eventId/teams',
    requireAuth,
    withTransaction((req, res) => teamController.create(req, res))
);
router.post(
    '/:eventId/teams/start-draft',
    requireAuth,
    requireEventManagementRole,
    withTransaction((req, res) => teamController.startDraft(req, res))
);
router.get(
    '/:eventId/teams/:teamId',
    requireAuth,
    withTransaction((req, res) => teamController.get(req, res))
);
router.patch(
    '/:eventId/teams/:teamId',
    requireAuth,
    withTransaction((req, res) => teamController.rename(req, res))
);
router.delete(
    '/:eventId/teams/:teamId',
    requireAuth,
    withTransaction((req, res) => teamController.remove(req, res))
);
router.post(
    '/:eventId/teams/:teamId/members',
    requireAuth,
    withTransaction((req, res) => teamController.addMember(req, res))
);
router.delete(
    '/:eventId/teams/:teamId/members/:userId',
    requireAuth,
    withTransaction((req, res) => teamController.removeMember(req, res))
);

export default router;
