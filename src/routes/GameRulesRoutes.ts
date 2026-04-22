import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { GameRulesController } from '../controller/GameRulesController.ts';
import { requireAuth } from '../middleware/AuthMiddleware.ts';

const router = Router();
const gameRulesController = new GameRulesController();

/**
 * GET /api/game-rules/catalog
 * Get compact details catalog
 *
 * Authentication: Required
 */
router.get('/catalog', requireAuth, withTransaction((req, res) => gameRulesController.getCatalog(req, res)));

/**
 * GET /api/game-rules/presets
 * Get available game rules presets
 *
 * Authentication: Required
 */
router.get('/presets', requireAuth, withTransaction((req, res) => gameRulesController.getPresets(req, res)));

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
 * Authentication: Required (admin, or owner of the rule's club)
 */
router.put('/:id/details', requireAuth, withTransaction((req, res) => gameRulesController.updateGameRulesDetails(req, res)));

/**
 * POST /api/game-rules
 * Create a new game rule
 *
 * Authentication: Required (admin for global rules, or owner of the target club)
 */
router.post('/', requireAuth, withTransaction((req, res) => gameRulesController.createGameRules(req, res)));

/**
 * PUT /api/game-rules/:id
 * Update an existing game rule (blocked if games have been played with it)
 *
 * Authentication: Required (admin, or owner of the rule's club)
 */
router.put('/:id', requireAuth, withTransaction((req, res) => gameRulesController.updateGameRules(req, res)));

/**
 * DELETE /api/game-rules/:id
 * Delete a game rule (blocked if any events reference it)
 *
 * Authentication: Required (admin, or owner of the rule's club)
 */
router.delete('/:id', requireAuth, withTransaction((req, res) => gameRulesController.deleteGameRules(req, res)));

export default router;
