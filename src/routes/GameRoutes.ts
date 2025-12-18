import { Router } from 'express';
import { GameController } from '../controller/GameController.ts';
import { withTransaction } from '../db/TransactionManagement.ts';

const router = Router();
const gameController = new GameController();

router.post('/', withTransaction((req, res) => gameController.addGame(req, res)));
router.get('/', withTransaction((req, res) => gameController.getGames(req, res)));
router.get('/:gameId', withTransaction((req, res) => gameController.getGameById(req, res)));
router.put('/:gameId', withTransaction((req, res) => gameController.editGame(req, res)));
router.delete('/:gameId', withTransaction((req, res) => gameController.deleteGame(req, res)));

export default router;