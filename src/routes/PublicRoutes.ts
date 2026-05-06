import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { PublicTournamentController } from '../controller/PublicTournamentController.ts';

const router = Router();
const publicTournamentController = new PublicTournamentController();

/**
 * GET /api/public/tournaments/:eventId
 *
 * Unauthenticated read for the public tournament-registration page.
 * Returns the event, its club (name + contacts), and the current approved-participants count.
 * SEASON events are intentionally hidden behind 404 — only TOURNAMENT details are exposed.
 */
router.get('/tournaments/:eventId', withTransaction((req, res) => publicTournamentController.getPublicTournament(req, res)));

export default router;
