import { Router } from 'express';
import { ProfileController } from '../controller/ProfileController.ts';
import { withTransaction } from '../db/TransactionManagement.ts';
import { requireAuth, requireAdmin } from '../middleware/AuthMiddleware.ts';

const router = Router({ mergeParams: true });
const profileController = new ProfileController();

router.patch('/', requireAuth, requireAdmin, withTransaction((req, res) => profileController.updateProfile(req, res)));

export default router;
