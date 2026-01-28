import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { GameRulesController } from '../controller/GameRulesController.ts';
import { requireAuth, requireAdmin } from '../middleware/AuthMiddleware.ts';

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
 * POST /api/game-rules
 * Create new game rules
 *
 * Authentication: Required (Admin only)
 */
router.post('/', requireAuth, requireAdmin, withTransaction((req, res) => gameRulesController.createGameRules(req, res)));

/**
 * PUT /api/game-rules/:id
 * Update existing game rules
 *
 * Authentication: Required (Admin only)
 */
router.put('/:id', requireAuth, requireAdmin, withTransaction((req, res) => gameRulesController.updateGameRules(req, res)));

/**
 * DELETE /api/game-rules/:id
 * Delete game rules (only if not used by events with games)
 *
 * Authentication: Required (Admin only)
 */
router.delete('/:id', requireAuth, requireAdmin, withTransaction((req, res) => gameRulesController.deleteGameRules(req, res)));

export default router;
