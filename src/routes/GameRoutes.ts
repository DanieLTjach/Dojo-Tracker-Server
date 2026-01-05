import { Router } from 'express';
import { GameController } from '../controller/GameController.ts';
import { withTransaction } from '../db/TransactionManagement.ts';
import { requireAuth, requireAdmin } from '../middleware/AuthMiddleware.ts';

const router = Router();
const gameController = new GameController();

// Authenticated users - read operations
router.get('/', requireAuth, withTransaction((req, res) => gameController.getGames(req, res)));
router.get('/:gameId', requireAuth, withTransaction((req, res) => gameController.getGameById(req, res)));

// Authenticated users - create games
router.post('/', requireAuth, withTransaction((req, res) => gameController.addGame(req, res)));

// Admin only - edit and delete games
router.put('/:gameId', requireAuth, requireAdmin, withTransaction((req, res) => gameController.editGame(req, res)));
router.delete('/:gameId', requireAuth, requireAdmin, withTransaction((req, res) => gameController.deleteGame(req, res)));

export default router;