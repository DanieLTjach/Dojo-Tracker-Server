import { Router } from 'express';
import { UserController } from '../controller/UserController.ts';

const router = Router();
const userController = new UserController();

router.post('/', (req, res) => userController.registerUser(req, res));
router.get('/', (req, res) => userController.getAllUsers(req, res));
router.get('/:id', (req, res) => userController.getUserById(req, res));
router.get('/by-telegram-id/:telegramId', (req, res) => userController.getUserByTelegramId(req, res));
router.patch('/:id', (req, res) => userController.editUser(req, res));
router.post('/:id/activate', (req, res) => userController.updateUserActivationStatus(req, res, true));
router.post('/:id/deactivate', (req, res) => userController.updateUserActivationStatus(req, res, false));

export default router;