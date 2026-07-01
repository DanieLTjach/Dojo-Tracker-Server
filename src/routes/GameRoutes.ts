import { Router } from 'express';
import { GameController } from '../controller/GameController.ts';
import { SmartCompassController } from '../controller/SmartCompassController.ts';
import { withTransaction } from '../db/TransactionManagement.ts';
import { requireAuth } from '../middleware/AuthMiddleware.ts';
import { requireJwtOrSmartCompassGameAuth } from '../middleware/SmartCompassAuthMiddleware.ts';

const router = Router();
const gameController = new GameController();
const smartCompassController = new SmartCompassController();

// Authenticated users - read operations
router.get('/', requireAuth, withTransaction((req, res) => gameController.getGames(req, res)));
router.get(
    '/:gameId',
    requireJwtOrSmartCompassGameAuth,
    withTransaction((req, res) => gameController.getGameById(req, res))
);

// Authenticated users - create games
router.post('/tracked', requireAuth, withTransaction((req, res) => gameController.addTrackedGame(req, res)));
router.post('/', requireAuth, withTransaction((req, res) => gameController.addGame(req, res)));
router.post(
    '/:gameId/smart-compass/pairing-codes',
    requireAuth,
    withTransaction((req, res) => smartCompassController.createPairingCode(req, res))
);
router.get(
    '/:gameId/smart-compass/sessions',
    requireAuth,
    withTransaction((req, res) => smartCompassController.listSessions(req, res))
);
router.delete(
    '/:gameId/smart-compass/sessions/:sessionId',
    requireAuth,
    withTransaction((req, res) => smartCompassController.revokeSession(req, res))
);
router.post(
    '/:gameId/rounds/:roundId/preview',
    requireJwtOrSmartCompassGameAuth,
    withTransaction((req, res) => gameController.previewRoundResult(req, res))
);
router.post(
    '/:gameId/rounds/:roundId',
    requireJwtOrSmartCompassGameAuth,
    withTransaction((req, res) => gameController.postRoundResult(req, res))
);
router.delete(
    '/:gameId/rounds/:roundId',
    requireJwtOrSmartCompassGameAuth,
    withTransaction((req, res) => gameController.deleteRoundResult(req, res))
);
router.post(
    '/:gameId/start',
    requireJwtOrSmartCompassGameAuth,
    withTransaction((req, res) => gameController.startTrackedGame(req, res))
);
router.post(
    '/:gameId/finish',
    requireJwtOrSmartCompassGameAuth,
    withTransaction((req, res) => gameController.finishGame(req, res))
);
router.post(
    '/:gameId/undo-finish',
    requireAuth,
    withTransaction((req, res) => gameController.undoFinishGame(req, res))
);

router.put('/:gameId', requireAuth, withTransaction((req, res) => gameController.editGame(req, res)));
router.patch(
    '/:gameId/players/:userId/substitute-player',
    requireAuth,
    withTransaction((req, res) => gameController.setSubstitutePlayer(req, res))
);
router.delete('/:gameId', requireAuth, withTransaction((req, res) => gameController.deleteGame(req, res)));

export default router;
