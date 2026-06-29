import { Router } from 'express';
import { GameController } from '../controller/GameController.ts';
import { withTransaction } from '../db/TransactionManagement.ts';
import { requireAuth } from '../middleware/AuthMiddleware.ts';
import { createCharge, withUsageTransaction } from '../middleware/UsageMiddleware.ts';
import { UsageAction } from '../model/UsageModels.ts';
import { EventService } from '../service/EventService.ts';
import { GameRepository } from '../repository/GameRepository.ts';

const router = Router();
const gameController = new GameController();
const eventService = new EventService();
const gameRepository = new GameRepository();

// Authenticated users - read operations
router.get('/', requireAuth, withTransaction((req, res) => gameController.getGames(req, res)));
router.get('/:gameId', requireAuth, withTransaction((req, res) => gameController.getGameById(req, res)));

// Authenticated users - create games
router.post(
    '/tracked',
    requireAuth,
    withUsageTransaction(
        req => chargeForEventId(req.body?.eventId, UsageAction.TRACKED_GAME_CREATED, req.user!.userId),
        (req, res) => gameController.addTrackedGame(req, res)
    )
);
router.post(
    '/',
    requireAuth,
    withUsageTransaction(
        req => chargeForEventId(req.body?.eventId, UsageAction.SAVED_GAME_CREATED, req.user!.userId),
        (req, res) => gameController.addGame(req, res)
    )
);
router.post(
    '/:gameId/rounds/:roundId/preview',
    requireAuth,
    withTransaction((req, res) => gameController.previewRoundResult(req, res))
);
router.post(
    '/:gameId/rounds/:roundId',
    requireAuth,
    withUsageTransaction(
        req => chargeForGameId(req.params['gameId'], UsageAction.TRACKED_ROUND_RESULT_CREATED, req.user!.userId),
        (req, res) => gameController.postRoundResult(req, res)
    )
);
router.delete(
    '/:gameId/rounds/:roundId',
    requireAuth,
    withTransaction((req, res) => gameController.deleteRoundResult(req, res))
);
router.post('/:gameId/start', requireAuth, withTransaction((req, res) => gameController.startTrackedGame(req, res)));
router.post('/:gameId/finish', requireAuth, withTransaction((req, res) => gameController.finishGame(req, res)));
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

function chargeForEventId(
    eventIdValue: unknown,
    action: UsageAction,
    modifiedBy: number,
    count?: number
) {
    const eventId = Number(eventIdValue);
    if (!Number.isInteger(eventId)) {
        return undefined;
    }
    try {
        const event = eventService.getEventById(eventId);
        return createCharge(event.clubId, action, modifiedBy, count);
    } catch {
        return undefined;
    }
}

function chargeForGameId(
    gameIdValue: unknown,
    action: UsageAction,
    modifiedBy: number,
    count?: number
) {
    const gameId = Number(gameIdValue);
    if (!Number.isInteger(gameId)) {
        return undefined;
    }
    const game = gameRepository.findGameById(gameId);
    if (game === undefined) {
        return undefined;
    }
    return chargeForEventId(game.eventId, action, modifiedBy, count);
}

export default router;
