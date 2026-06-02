import { Router } from 'express';
import { withTransaction } from '../db/TransactionManagement.ts';
import { ClubInviteController } from '../controller/ClubInviteController.ts';

const router = Router();
const inviteController = new ClubInviteController();

router.get('/:code', withTransaction((req, res) => inviteController.previewInvite(req, res)));
router.post('/:code/redeem', withTransaction((req, res) => inviteController.redeemInvite(req, res)));

export default router;
