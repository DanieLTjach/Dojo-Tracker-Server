import express from 'express';
import { ClubController } from './ClubController.js';

const router = express.Router();
const clubController = new ClubController();

router.post('/add', (req, res) => clubController.add(req, res));
router.post('/edit', (req, res) => clubController.edit(req, res));
router.post('/remove', (req, res) => clubController.remove(req, res));
router.get('/list', (req, res) => clubController.list(req, res));
router.get('/get', (req, res) => clubController.get(req, res));

export default router;