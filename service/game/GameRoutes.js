import { Router } from 'express';
import { GameController } from './GameController.js';

const router = Router();
const gameController = new GameController();

router.post('/add', (req, res) => gameController.add(req, res));
router.post('/edit', (req, res) => gameController.edit(req, res));
router.post('/remove', (req, res) => gameController.remove(req, res));
router.get('/list', (req, res) => gameController.list(req, res));
router.get('/get', (req, res) => gameController.get(req, res));

export default router;