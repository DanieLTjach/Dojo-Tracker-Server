import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { PublicTournamentController } from '../controller/PublicTournamentController.ts';
import { PublicAchievementController } from '../controller/PublicAchievementController.ts';

const router = Router();
const publicTournamentController = new PublicTournamentController();
const publicAchievementController = new PublicAchievementController();

/**
 * GET /api/public/tournaments/:eventId
 *
 * Unauthenticated read for the public tournament-registration page.
 * Returns the event, its club, and a privacy-filtered list of approved participants.
 * SEASON events are intentionally hidden behind 404 — only TOURNAMENT details are exposed.
 */
router.get(
    '/tournaments/:eventId',
    withTransaction((req, res) => publicTournamentController.getPublicTournament(req, res))
);

/**
 * GET /api/public/users/:userId/achievements/:code
 *
 * Unauthenticated read for the public achievement share page.
 * Returns the achievement details and the owner's public identity.
 * Hidden profiles and locked achievements are refused with 404.
 */
router.get(
    '/users/:userId/achievements/:code',
    withTransaction((req, res) => publicAchievementController.getPublicUserAchievement(req, res))
);

export default router;
