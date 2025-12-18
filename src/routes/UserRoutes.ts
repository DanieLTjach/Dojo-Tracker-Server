import { Router } from 'express';
import { UserController } from '../controller/UserController.ts';
import { withTransaction } from '../db/TransactionManagement.ts';

const router = Router();
const userController = new UserController();

router.post('/', withTransaction((req, res) => userController.registerUser(req, res)));
router.get('/', withTransaction((req, res) => userController.getAllUsers(req, res)));
router.get('/:id', withTransaction((req, res) => userController.getUserById(req, res)));
router.get('/by-telegram-id/:telegramId', withTransaction((req, res) => userController.getUserByTelegramId(req, res)));
router.patch('/:id', withTransaction((req, res) => userController.editUser(req, res)));
router.post('/:id/activate', withTransaction((req, res) => userController.updateUserActivationStatus(req, res, true)));
router.post('/:id/deactivate', withTransaction((req, res) => userController.updateUserActivationStatus(req, res, false)));

export default router;