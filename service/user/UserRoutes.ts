import { Router } from 'express';
import { UserController } from './UserController.js';

const router = Router();
const userController = new UserController();

router.post('/register', (req, res) => userController.register(req, res));
router.post('/edit', (req, res) => userController.edit(req, res));
router.post('/remove', (req, res) => userController.remove_user(req, res));
router.post('/activate', (req, res) => userController.activate_user(req, res));
router.get('/get/:telegram_id', (req, res) => userController.get_user(req, res));
router.get('/getBy', (req, res) => userController.get_by(req, res)); // ЗАТЫЧКА

export default router;