import { Router } from 'express';
import { GameController } from './GameController.ts';

const router = Router();
const gameController = new GameController();

router.post('/', (req, res) => gameController.addGame(req, res));
router.get('/', (req, res) => gameController.getGames(req, res));
router.get('/:gameId', (req, res) => gameController.getGameById(req, res));
router.put('/:gameId', (req, res) => gameController.editGame(req, res));
router.delete('/:gameId', (req, res) => gameController.deleteGame(req, res));

export default router;