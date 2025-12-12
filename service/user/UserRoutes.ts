import { Router } from 'express';
import { UserController } from './UserController.ts';

const router = Router();
const userController = new UserController();

router.post('/', (req, res) => userController.registerUser(req, res));
router.get('/:telegramId', (req, res) => userController.getUser(req, res));
router.patch('/:telegramId', (req, res) => userController.editUser(req, res));
router.post('/:telegramId/activate', (req, res) => userController.updateUserActivationStatus(req, res, true));
router.post('/:telegramId/deactivate', (req, res) => userController.updateUserActivationStatus(req, res, false));

export default router;