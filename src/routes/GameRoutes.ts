import { Router } from 'express';
import { GameController } from '../controller/GameController.ts';
import { withTransaction } from '../db/TransactionManagement.ts';
import { requireAuth } from '../middleware/AuthMiddleware.ts';

const router = Router();
const gameController = new GameController();

// Authenticated users - read operations
router.get('/', requireAuth, withTransaction((req, res) => gameController.getGames(req, res)));
router.get('/:gameId', requireAuth, withTransaction((req, res) => gameController.getGameById(req, res)));

// Authenticated users - create games
router.post('/tracked', requireAuth, withTransaction((req, res) => gameController.addTrackedGame(req, res)));
router.post('/', requireAuth, withTransaction((req, res) => gameController.addGame(req, res)));
router.post('/:gameId/rounds/:roundId', requireAuth, withTransaction((req, res) => gameController.postRoundResult(req, res)));
router.delete('/:gameId/rounds/:roundId', requireAuth, withTransaction((req, res) => gameController.deleteRoundResult(req, res)));
router.post('/:gameId/finish', requireAuth, withTransaction((req, res) => gameController.finishGame(req, res)));
router.post('/:gameId/undo-finish', requireAuth, withTransaction((req, res) => gameController.undoFinishGame(req, res)));

router.put('/:gameId', requireAuth, withTransaction((req, res) => gameController.editGame(req, res)));
router.delete('/:gameId', requireAuth, withTransaction((req, res) => gameController.deleteGame(req, res)));

export default router;
