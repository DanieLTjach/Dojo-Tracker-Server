import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { ClubController } from '../controller/ClubController.ts';
import { ClubMembershipController } from '../controller/ClubMembershipController.ts';
import { requireAuth, requireAdmin } from '../middleware/AuthMiddleware.ts';
import { requireClubRole } from '../middleware/ClubRoleMiddleware.ts';

const router = Router();
const clubController = new ClubController();
const membershipController = new ClubMembershipController();

router.get('/', withTransaction((req, res) => clubController.getAllClubs(req, res)));
router.get('/:clubId', withTransaction((req, res) => clubController.getClubById(req, res)));
router.get('/:clubId/status', requireAuth, withTransaction((req, res) => membershipController.getStatus(req, res)));
router.post('/', requireAuth, requireAdmin, withTransaction((req, res) => clubController.createClub(req, res)));
router.put('/:clubId', requireAuth, requireClubRole('OWNER'), withTransaction((req, res) => clubController.updateClub(req, res)));
router.delete('/:clubId', requireAuth, requireAdmin, withTransaction((req, res) => clubController.deleteClub(req, res)));

router.get(
    '/:clubId/members',
    requireAuth,
    requireClubRole('OWNER', 'MODERATOR'),
    withTransaction((req, res) => membershipController.getMembers(req, res))
);
router.get('/:clubId/members/active', withTransaction((req, res) => membershipController.getActiveMembers(req, res)));
router.get(
    '/:clubId/members/pending',
    requireAuth,
    requireClubRole('OWNER', 'MODERATOR'),
    withTransaction((req, res) => membershipController.getPendingMembers(req, res))
);
router.post('/:clubId/join', requireAuth, withTransaction((req, res) => membershipController.requestJoin(req, res)));
router.post('/:clubId/leave', requireAuth, withTransaction((req, res) => membershipController.leaveClub(req, res)));
router.post(
    '/:clubId/members/:userId/activate',
    requireAuth,
    requireClubRole('OWNER', 'MODERATOR'),
    withTransaction((req, res) => membershipController.activateMember(req, res))
);
router.post(
    '/:clubId/members/:userId/deactivate',
    requireAuth,
    requireClubRole('OWNER', 'MODERATOR'),
    withTransaction((req, res) => membershipController.deactivateMember(req, res))
);
router.patch(
    '/:clubId/members/:userId',
    requireAuth,
    requireClubRole('OWNER'),
    withTransaction((req, res) => membershipController.updateMemberRole(req, res))
);

export default router;
