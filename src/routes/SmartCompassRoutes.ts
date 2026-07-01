import { Router } from 'express';
import { SmartCompassController } from '../controller/SmartCompassController.ts';
import { withTransaction } from '../db/TransactionManagement.ts';

const router = Router();
const smartCompassController = new SmartCompassController();

router.post('/sessions', withTransaction((req, res) => smartCompassController.redeemSession(req, res)));

export default router;
