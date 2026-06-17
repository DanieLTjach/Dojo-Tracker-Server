import dedent from 'dedent';
import { BadRequestError } from '../error/BaseErrors.ts';
import {
    CannotUndoFinishOnNonTrackedGameError,
    GameNotCreatedWhenStartingError,
    GameNotFinishedWhenUndoingFinishError,
    GameNotInProgressWhenAddingNewRoundError,
    GameNotInProgressWhenDeletingRoundError,
    GameNotInProgressWhenFinishingError,
    IncorrectPlayerCountError,
    InvalidRoundIdError,
    LastRoundRollbackAlreadyUsedError,
    NoRoundsCompletedError,
    NoRoundsToRollbackError,
    RoundAlreadyExistsError,
} from '../error/GameErrors.ts';
import type { Event, GameRules } from '../model/EventModels.ts';
import type {
    DetailedGame,
    GamePlayer,
    GameRound,
    GameWithPlayers,
    TrackedGamePlayerData,
} from '../model/GameModels.ts';
import { GameStatus } from '../model/GameModels.ts';
import type { GameRoundResult, GameRoundResultInputDTO, PlayerPointChange } from '../model/GameRoundResultModels.ts';
import { GameRepository } from '../repository/GameRepository.ts';
import {
    calculateGameRoundResult,
    calculateRemainingRiichiSticksPointChanges,
    mergePlayerPointChanges,
} from '../util/PointCalculationUtil.ts';
import { AchievementService } from './AchievementService.ts';
import { ClubMembershipService } from './ClubMembershipService.ts';
import { EventService } from './EventService.ts';
import { GameService } from './GameService.ts';
import { RatingService } from './RatingService.ts';
import { UserService } from './UserService.ts';

const TRACKED_GAME_LOG_ACTIONS = {
    CREATED: { heading: 'New Tracked Game Created', actorLabel: 'Created by' },
    STARTED_ON_CREATE: { heading: 'New Tracked Game Started', actorLabel: 'Created by' },
    STARTED: { heading: 'Tracked Game Started', actorLabel: 'Started by' },
} as const;

type TrackedGameLogAction = keyof typeof TRACKED_GAME_LOG_ACTIONS;

export class TrackedGameService {
    private gameService: GameService = new GameService();
    private gameRepository: GameRepository = new GameRepository();
    private userService: UserService = new UserService();
    private eventService: EventService = new EventService();
    private ratingService: RatingService = new RatingService();
    private clubMembershipService: ClubMembershipService = new ClubMembershipService();
    private achievementService: AchievementService = new AchievementService();

    createTrackedGame(
        eventId: number,
        players: TrackedGamePlayerData[],
        createdBy: number,
        status: GameStatus,
        createdAt?: Date,
        tournamentRound?: number,
        tournamentTable?: string
    ): DetailedGame {
        const gameTimestamp = createdAt ?? new Date();

        const event = this.eventService.getEventById(eventId);
        this.gameService.authorizeGameCreation(event, players, createdBy);
        this.validateTrackedGamePlayers(players, event.gameRules);
        this.gameService.validateGameWithinEventDates(event, gameTimestamp, createdBy, status);
        this.gameService.validateNoDuplicateGameTimestamp(eventId, gameTimestamp);
        this.gameService.validateUniqueTournamentRoundTable(
            event,
            tournamentRound ?? null,
            tournamentTable ?? null,
            null
        );

        const newGameId = this.gameRepository.createTrackedGame(
            eventId,
            createdBy,
            gameTimestamp,
            status,
            tournamentRound,
            tournamentTable
        );
        this.addPlayersToTrackedGame(newGameId, players, event.gameRules.startingPoints, createdBy);

        const newGame = this.gameService.getDetailedGameById(newGameId);
        const logAction = status === GameStatus.CREATED ? 'CREATED' : 'STARTED_ON_CREATE';
        this.logTrackedGameAction(newGame, event, logAction, createdBy);
        return newGame;
    }

    addGameRoundResult(
        gameId: number,
        roundId: number,
        resultInputDTO: GameRoundResultInputDTO,
        modifiedBy: number
    ): DetailedGame {
        const game = this.gameService.getDetailedGameById(gameId);
        const event = this.eventService.getEventById(game.eventId);

        this.validateRoundResultInput(game, event, roundId, modifiedBy);

        const result: GameRoundResult = calculateGameRoundResult(game, event.gameRules, resultInputDTO);

        this.gameRepository.createGameRound(gameId, roundId, game.currentState!, result);
        this.gameRepository.applyPlayerPointChanges(gameId, result.playerPointChanges, modifiedBy);
        this.addChomboFromRoundResult(gameId, result, modifiedBy);
        this.gameRepository.setLastRoundWasDeleted(gameId, false, modifiedBy);
        this.gameRepository.touchGame(gameId, modifiedBy);

        return result.gameFinishReason
            ? this.finishGame(gameId, modifiedBy)
            : this.gameService.getDetailedGameById(gameId);
    }

    previewGameRoundResult(
        gameId: number,
        roundId: number,
        resultInputDTO: GameRoundResultInputDTO,
        modifiedBy: number
    ): GameRoundResult {
        const game = this.gameService.getDetailedGameById(gameId);
        const event = this.eventService.getEventById(game.eventId);

        this.validateRoundResultInput(game, event, roundId, modifiedBy);

        return calculateGameRoundResult(game, event.gameRules, resultInputDTO);
    }

    deleteGameRoundResult(gameId: number, roundId: number, modifiedBy: number): DetailedGame {
        const game = this.gameService.getDetailedGameById(gameId);
        const event = this.eventService.getEventById(game.eventId);

        this.gameService.authorizeTrackedGameAction(game, event, modifiedBy);
        this.validateGameIsInProgress(game, () => new GameNotInProgressWhenDeletingRoundError());
        this.validateLastRoundIdBeforeDeleting(game.rounds, roundId);
        this.validatePlayerCanRollbackLastRound(game, event, modifiedBy);

        const lastRound = game.rounds[game.rounds.length - 1]!;
        const reversedPointChanges = lastRound.result.playerPointChanges.map(change => ({
            playerId: change.playerId,
            pointChange: -change.pointChange,
        }));

        this.gameRepository.deleteGameRound(gameId, roundId);
        this.gameRepository.applyPlayerPointChanges(gameId, reversedPointChanges, modifiedBy);
        this.subtractChomboFromRoundResult(gameId, lastRound.result, modifiedBy);
        this.gameRepository.setLastRoundWasDeleted(gameId, true, modifiedBy);
        this.gameRepository.touchGame(gameId, modifiedBy);

        const updatedGame = this.gameService.getDetailedGameById(gameId);
        this.logGameRoundRollback(updatedGame, event, lastRound, modifiedBy);
        return updatedGame;
    }

    finishGame(gameId: number, modifiedBy: number): DetailedGame {
        const game = this.gameService.getDetailedGameById(gameId);
        const event = this.eventService.getEventById(game.eventId);

        this.gameService.authorizeTrackedGameAction(game, event, modifiedBy);
        this.validateGameIsInProgress(game, () => new GameNotInProgressWhenFinishingError());
        this.validateGameHasAtLeastOneRound(game.rounds);

        const players = this.applyRemainingRiichiSticksOnFinish(game, event.gameRules, modifiedBy);

        const finishedAt = new Date();
        const standingsBefore = this.ratingService.calculateStandings(event.id);

        this.gameRepository.finishGame(gameId, modifiedBy, finishedAt);
        this.ratingService.addRatingChangesFromGame(
            gameId,
            finishedAt,
            players,
            event.id,
            event.gameRules,
            event.startingRating
        );

        this.achievementService.recomputeEventAchievementsIfTournamentFinished(event);

        const finishedGame = this.gameService.getDetailedGameById(gameId);
        this.gameService.logGameAction(finishedGame, event, modifiedBy, '✅ Game Finished', 'Finished by');
        this.gameService.logRatingUpdateForGame(
            finishedGame,
            event,
            standingsBefore,
            this.ratingService.calculateStandings(event.id),
            modifiedBy
        );

        return finishedGame;
    }

    startTrackedGame(gameId: number, modifiedBy: number): DetailedGame {
        const game = this.gameService.getDetailedGameById(gameId);
        const event = this.eventService.getEventById(game.eventId);

        this.gameService.authorizeGamePlayerAction(game, modifiedBy);
        this.validateGameIsCreated(game);
        this.eventService.validateTournamentGameCanStart(event, game);

        const startedAt = new Date();
        this.gameService.validateGameWithinEventDates(event, startedAt, modifiedBy, GameStatus.IN_PROGRESS);

        this.gameRepository.startTrackedGame(gameId, modifiedBy, startedAt);

        const startedGame = this.gameService.getDetailedGameById(gameId);
        this.logTrackedGameAction(startedGame, event, 'STARTED', modifiedBy);
        return startedGame;
    }

    undoFinishGame(gameId: number, modifiedBy: number): DetailedGame {
        const game = this.gameService.getDetailedGameById(gameId);
        const event = this.eventService.getEventById(game.eventId);

        this.gameService.authorizeClubScopedAction(event.clubId, modifiedBy, ['OWNER', 'MODERATOR']);
        this.validateCanUndoGameFinish(game);

        this.ratingService.deleteRatingChangesFromGame(game);
        this.gameRepository.undoFinishGame(gameId, modifiedBy);
        this.undoRemainingRiichiSticksOnFinish(game, event.gameRules, modifiedBy);

        this.achievementService.recomputeEventAchievementsIfTournamentFinished(event);

        const reopenedGame = this.gameService.getDetailedGameById(gameId);
        this.gameService.logGameAction(reopenedGame, event, modifiedBy, '↩️ Game Finish Undone', 'Undone by');
        return reopenedGame;
    }

    private addPlayersToTrackedGame(
        gameId: number,
        players: TrackedGamePlayerData[],
        startingPoints: number,
        modifiedBy: number
    ): void {
        for (const player of players) {
            this.gameRepository.addGamePlayer(
                gameId,
                player.userId,
                startingPoints,
                player.startPlace,
                0,
                player.isSubstitutePlayer ?? false,
                modifiedBy
            );
        }
    }

    private validateGameIsCreated(game: GameWithPlayers): void {
        if (game.status !== GameStatus.CREATED) {
            throw new GameNotCreatedWhenStartingError();
        }
    }

    private validateGameIsInProgress(game: GameWithPlayers, error: () => BadRequestError): void {
        if (game.status !== GameStatus.IN_PROGRESS) {
            throw error();
        }
    }

    private validateGameIsFinished(game: GameWithPlayers, error: () => BadRequestError): void {
        if (game.status !== GameStatus.FINISHED) {
            throw error();
        }
    }

    private validateCanUndoGameFinish(game: DetailedGame): void {
        this.validateGameIsFinished(game, () => new GameNotFinishedWhenUndoingFinishError());
        if (game.rounds.length === 0) {
            throw new CannotUndoFinishOnNonTrackedGameError();
        }
    }

    private validateGameHasAtLeastOneRound(rounds: GameRound[]): void {
        if (rounds.length === 0) {
            throw new NoRoundsCompletedError();
        }
    }

    private validateRoundResultInput(
        game: DetailedGame,
        event: Event,
        roundId: number,
        modifiedBy: number
    ): void {
        this.gameService.authorizeTrackedGameAction(game, event, modifiedBy);
        this.validateGameIsInProgress(game, () => new GameNotInProgressWhenAddingNewRoundError());
        this.validateCurrentRoundIdBeforeAdding(game.rounds, roundId);
    }

    private validateCurrentRoundIdBeforeAdding(rounds: GameRound[], roundId: number): void {
        if (rounds.some(round => round.roundNumber === roundId)) {
            throw new RoundAlreadyExistsError();
        }

        const expectedRoundId = rounds.length + 1;
        if (roundId !== expectedRoundId) {
            throw new InvalidRoundIdError(expectedRoundId, roundId);
        }
    }

    private validateLastRoundIdBeforeDeleting(rounds: GameRound[], roundId: number): void {
        if (rounds.length === 0) {
            throw new NoRoundsToRollbackError();
        }

        const lastRoundNumber = rounds[rounds.length - 1]!.roundNumber;
        if (roundId !== lastRoundNumber) {
            throw new InvalidRoundIdError(lastRoundNumber, roundId);
        }
    }

    private validatePlayerCanRollbackLastRound(game: GameWithPlayers, event: Event, userId: number): void {
        if (this.canBypassLastRoundRollbackLimit(event, userId)) {
            return;
        }

        if (game.lastRoundWasDeleted) {
            throw new LastRoundRollbackAlreadyUsedError();
        }
    }

    private canBypassLastRoundRollbackLimit(event: Event, userId: number): boolean {
        const user = this.userService.getUserById(userId);
        if (user.isAdmin) {
            return true;
        }

        if (event.clubId !== null) {
            const role = this.clubMembershipService.getUserClubRole(event.clubId, userId);
            if (role === 'OWNER' || role === 'MODERATOR') {
                return true;
            }
        }

        return false;
    }

    private addChomboFromRoundResult(gameId: number, result: GameRoundResult, modifiedBy: number) {
        if (result.type === 'CHOMBO') {
            this.gameRepository.updatePlayerChomboCount(gameId, result.offenderPlayerId, 1, modifiedBy);
        }
    }

    private subtractChomboFromRoundResult(gameId: number, result: GameRoundResult, modifiedBy: number) {
        if (result.type === 'CHOMBO') {
            this.gameRepository.updatePlayerChomboCount(gameId, result.offenderPlayerId, -1, modifiedBy);
        }
    }

    private applyRemainingRiichiSticksOnFinish(
        game: DetailedGame,
        gameRules: GameRules,
        modifiedBy: number
    ): GamePlayer[] {
        const extraPointChanges = this.calculateRemainingRiichiSticksPointChangesForGame(game, gameRules);
        if (extraPointChanges.length === 0) {
            return game.players;
        }

        this.persistRemainingRiichiSticksPointChanges(game, extraPointChanges, modifiedBy);

        return this.gameRepository.findGamePlayersByGameId(game.id);
    }

    private undoRemainingRiichiSticksOnFinish(
        game: DetailedGame,
        gameRules: GameRules,
        modifiedBy: number
    ): void {
        const extraPointChanges = this.calculateRemainingRiichiSticksPointChangesForGame(game, gameRules);
        if (extraPointChanges.length === 0) {
            return;
        }

        const reversedPointChanges = extraPointChanges.map(change => ({
            playerId: change.playerId,
            pointChange: -change.pointChange,
        }));

        this.persistRemainingRiichiSticksPointChanges(game, reversedPointChanges, modifiedBy);
    }

    private calculateRemainingRiichiSticksPointChangesForGame(
        game: DetailedGame,
        gameRules: GameRules
    ): PlayerPointChange[] {
        const riichiStickCount = this.getRemainingRiichiStickCount(game);
        if (riichiStickCount === 0) {
            return [];
        }

        return calculateRemainingRiichiSticksPointChanges(game.players, gameRules, riichiStickCount);
    }

    private getRemainingRiichiStickCount(game: DetailedGame): number {
        const lastRound = game.rounds[game.rounds.length - 1];
        return lastRound?.result.nextState?.riichiSticks ?? 0;
    }

    private persistRemainingRiichiSticksPointChanges(
        game: DetailedGame,
        pointChanges: PlayerPointChange[],
        modifiedBy: number
    ): void {
        const lastRound = game.rounds[game.rounds.length - 1]!;
        const updatedResult: GameRoundResult = {
            ...lastRound.result,
            playerPointChanges: mergePlayerPointChanges(
                lastRound.result.playerPointChanges,
                pointChanges
            ),
        };

        this.gameRepository.updateGameRoundResult(game.id, lastRound.roundNumber, updatedResult);
        this.gameRepository.applyPlayerPointChanges(game.id, pointChanges, modifiedBy);
        this.gameRepository.touchGame(game.id, modifiedBy);
    }

    private validateTrackedGamePlayers(players: TrackedGamePlayerData[], gameRules: GameRules): void {
        if (players.length !== gameRules.numberOfPlayers) {
            throw new IncorrectPlayerCountError(gameRules.numberOfPlayers);
        }

        for (const player of players) {
            this.userService.validateUserIsActiveById(player.userId);
        }

        this.gameService.validateNoDuplicatePlayers(players);
    }

    private logTrackedGameAction(
        game: GameWithPlayers,
        event: Event,
        action: TrackedGameLogAction,
        actorId: number
    ): void {
        const { heading, actorLabel } = TRACKED_GAME_LOG_ACTIONS[action];
        const user = this.userService.getUserById(actorId);
        const message = dedent`
            <b>🎮 ${heading}</b>

            <b>Game ID:</b> <code>${game.id}</code>
            ${this.gameService.formatEventGameLogSection(game, event)}
            <b>Timestamp:</b> <code>${game.createdAt.toISOString()}</code>
            <b>${actorLabel}:</b> ${user.name} <code>(ID: ${user.id})</code>

            <b>Players:</b>\n
        ` + this.printTrackedGamePlayersLog(game.players);
        this.gameService.logMessageToGameLogsTopics(message, event);
    }

    private logGameRoundRollback(
        game: DetailedGame,
        event: Event,
        deletedRound: GameRound,
        modifiedBy: number
    ): void {
        const user = this.userService.getUserById(modifiedBy);
        const pointChangesSection = deletedRound.result.playerPointChanges.length > 0
            ? `\n\n<b>Point changes removed:</b>\n` +
                this.printRoundPointChangesLog(deletedRound.result.playerPointChanges)
            : '';

        const message = dedent`
            <b>↩️ Last Round Rolled Back</b>

            <b>Game ID:</b> <code>${game.id}</code>
            ${this.gameService.formatEventGameLogSection(game, event)}
            <b>Round:</b> <code>${deletedRound.wind} ${deletedRound.dealerNumber} Repeat ${deletedRound.counters} (${deletedRound.roundNumber})</code>
            <b>Result type:</b> <code>${deletedRound.result.type}</code>
            <b>Rolled back by:</b> ${user.name} <code>(ID: ${user.id})</code>
        ` + pointChangesSection;
        this.gameService.logMessageToGameLogsTopics(message, event);
    }

    private printTrackedGamePlayersLog(players: GamePlayer[]): string {
        return players.map((p, index) => {
            const user = this.userService.getUserById(p.userId);
            return `${
                index + 1
            }. <b>${user.name}</b> <code>(ID: ${user.id})</code>\n   • Start Place: <b>${p.startPlace}</b>`;
        }).join('\n\n');
    }

    private printRoundPointChangesLog(pointChanges: PlayerPointChange[]): string {
        return pointChanges.map(change => {
            const user = this.userService.getUserById(change.playerId);
            const sign = change.pointChange >= 0 ? '+' : '';
            return `• <b>${user.name}</b> <code>(ID: ${user.id})</code>: <b>${sign}${change.pointChange}</b>`;
        }).join('\n');
    }
}
