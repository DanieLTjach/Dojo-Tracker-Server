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

/**
 * GET /api/skill/leaderboard
 * Custom leaderboard computed on demand and not stored.
 *
 * Query: clubId (omit for all clubs), gameSize (3|4, default 4),
 *        tags (comma-separated), matchAll (default false = any tag),
 *        eventType (SEASON|TOURNAMENT), threshold (default 30).
 *
 * Read-only: unlike the recompute endpoints this never writes skillRating,
 * so it needs no club role.
 */
router.get(
    '/skill/leaderboard',
    requireAuth,
    withTransaction((req, res) => skillController.getCustomSkillLeaderboard(req, res))
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

router.get(
    '/clubs/:clubId/skill/config',
    requireAuth,
    withTransaction((req, res) => skillController.getClubSkillConfig(req, res))
);

router.patch(
    '/clubs/:clubId/skill/config',
    requireAuth,
    requireClubRole('OWNER'),
    withTransaction((req, res) => skillController.updateClubSkillConfig(req, res))
);

router.put(
    '/clubs/:clubId/skill/config',
    requireAuth,
    requireClubRole('OWNER'),
    withTransaction((req, res) => skillController.updateClubSkillConfig(req, res))
);

export default router;
