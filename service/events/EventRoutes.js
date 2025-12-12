import express from 'express';
import { EventController } from './EventController.js';

const router = express.Router();
const eventController = new EventController();

router.post('/add', (req, res) => eventController.add(req, res));
router.post('/edit', (req, res) => eventController.edit(req, res));
router.post('/remove', (req, res) => eventController.remove(req, res));
router.get('/list', (req, res) => eventController.list(req, res));

export default router;