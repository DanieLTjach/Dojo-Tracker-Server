import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { SkillController } from '../controller/SkillController.ts';
import { requireAdmin, requireAuth } from '../middleware/AuthMiddleware.ts';
import { requireClubRole } from '../middleware/ClubRoleMiddleware.ts';

const router = Router();
const skillController = new SkillController();

router.get(
    '/users/:userId/skill',
    requireAuth,
    withTransaction((req, res) => skillController.getUserSkill(req, res))
);

router.get(
    '/clubs/:clubId/skill/leaderboard',
    requireAuth,
    withTransaction((req, res) => skillController.getClubSkillLeaderboard(req, res))
);

router.post(
    '/clubs/:clubId/skill/recompute',
    requireAuth,
    requireClubRole('OWNER', 'MODERATOR'),
    withTransaction((req, res) => skillController.recomputeClubSkill(req, res))
);

router.post(
    '/admin/skill/recompute',
    requireAuth,
    requireAdmin,
    withTransaction((req, res) => skillController.recomputeAdminSkill(req, res))
);

router.patch(
    '/clubs/:clubId/skill/config',
    requireAuth,
    requireClubRole('OWNER'),
    withTransaction((req, res) => skillController.updateClubSkillConfig(req, res))
);

export default router;
