import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { GameRulesController } from '../controller/GameRulesController.ts';
import { requireAuth } from '../middleware/AuthMiddleware.ts';

const router = Router();
const gameRulesController = new GameRulesController();

/**
 * GET /api/game-rules
 * Get all game rules
 *
 * Authentication: Required
 */
router.get('/', requireAuth, withTransaction((req, res) => gameRulesController.getAllGameRules(req, res)));

/**
 * GET /api/game-rules/:id
 * Get game rules by ID
 *
 * Authentication: Required
 */
router.get('/:id', requireAuth, withTransaction((req, res) => gameRulesController.getGameRulesById(req, res)));

/**
 * PUT /api/game-rules/:id/details
 * Update game rules details
 *
 * Authentication: Required
 */
router.put('/:id/details', requireAuth, withTransaction((req, res) => gameRulesController.updateGameRulesDetails(req, res)));

export default router;
