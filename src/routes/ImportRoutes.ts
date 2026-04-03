import { Router } from 'express';
import multer from 'multer';
import { ImportController } from '../controller/ImportController.ts';
import { withTransaction } from '../db/TransactionManagement.ts';
import { requireAuth, requireAdmin } from '../middleware/AuthMiddleware.ts';

const router = Router();
const importController = new ImportController();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
    '/games',
    requireAuth,
    requireAdmin,
    upload.single('file'),
    withTransaction((req, res) => importController.importGames(req, res))
);

export default router;
