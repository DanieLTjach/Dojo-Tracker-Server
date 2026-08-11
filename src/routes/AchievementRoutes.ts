import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { requireAuth } from '../middleware/AuthMiddleware.ts';
import { AchievementController } from '../controller/AchievementController.ts';

const router = Router();
const achievementController = new AchievementController();

router.get(
    '/catalog',
    requireAuth,
    withTransaction((req, res) => achievementController.getAutomaticCatalog(req, res))
);

router.post(
    '/recompute',
    requireAuth,
    withTransaction((req, res) => achievementController.recomputeAutomaticAchievements(req, res))
);

export default router;
