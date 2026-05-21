import dedent from "dedent";
import { BadRequestError } from "../error/BaseErrors.ts";
import { CannotUndoFinishOnNonTrackedGameError, GameNotFinishedWhenUndoingFinishError, GameNotInProgressWhenAddingNewRoundError, GameNotInProgressWhenDeletingRoundError, GameNotInProgressWhenFinishingError, IncorrectPlayerCountError, InvalidRoundIdError, InvalidRoundResultPlayerError, LastRoundRollbackAlreadyUsedError, NoRoundsCompletedError, NoRoundsToRollbackError, RoundAlreadyExistsError } from "../error/GameErrors.ts";
import type { Event, GameRules } from "../model/EventModels.ts";
import type { DetailedGame, GamePlayer, GameRound, GameWithPlayers, TrackedGamePlayerData } from "../model/GameModels.ts";
import { GameStatus } from "../model/GameModels.ts";
import type { GameRoundResult, GameRoundResultInputDTO, PlayerPointChange } from "../model/GameRoundResultModels.ts";
import { GameRepository } from "../repository/GameRepository.ts";
import { calculateGameRoundResult, calculateRemainingRiichiSticksPointChanges, mergePlayerPointChanges } from "../util/PointCalculationUtil.ts";
import { ClubMembershipService } from "./ClubMembershipService.ts";
import { EventService } from "./EventService.ts";
import { GameService } from "./GameService.ts";
import { RatingService } from "./RatingService.ts";
import { UserService } from "./UserService.ts";

export class TrackedGameService {

    private gameService: GameService = new GameService();
    private gameRepository: GameRepository = new GameRepository();
    private userService: UserService = new UserService();
    private eventService: EventService = new EventService();
    private ratingService: RatingService = new RatingService();
    private clubMembershipService: ClubMembershipService = new ClubMembershipService();

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

        const newGameId = this.gameRepository.createTrackedGame(eventId, createdBy, gameTimestamp, status, tournamentRound, tournamentTable);
        this.addPlayersToTrackedGame(newGameId, players, event.gameRules.startingPoints, createdBy);

        const newGame = this.gameService.getDetailedGameById(newGameId);
        this.logNewTrackedGame(newGame, event, status);
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

        this.gameService.authorizeTrackedGameAction(game, event, modifiedBy);
        this.validateGameIsInProgress(game, () => new GameNotInProgressWhenAddingNewRoundError());
        this.validateCurrentRoundIdBeforeAdding(game.rounds, roundId);
        this.validateRoundResultPlayers(resultInputDTO, game.players);

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

    deleteGameRoundResult(gameId: number, roundId: number, modifiedBy: number): DetailedGame {
        const game = this.gameService.getDetailedGameById(gameId);
        const event = this.eventService.getEventById(game.eventId);

        this.gameService.authorizeTrackedGameAction(game, event, modifiedBy);
        this.validateGameIsInProgress(game, () => new GameNotInProgressWhenDeletingRoundError());
        this.validateLastRoundIdBeforeDeleting(game.rounds, roundId);
        this.validatePlayerCanRollbackLastRound(game, event, modifiedBy);

        const lastRound = game.rounds[game.rounds.length - 1]!;
        const reversedPointChanges = lastRound.result.playerPointChanges.map((change) => ({
            playerId: change.playerId,
            pointChange: -change.pointChange
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

    undoFinishGame(gameId: number, modifiedBy: number): DetailedGame {
        const game = this.gameService.getDetailedGameById(gameId);
        const event = this.eventService.getEventById(game.eventId);

        this.gameService.authorizeClubScopedAction(event.clubId, modifiedBy, ['OWNER', 'MODERATOR']);
        this.validateCanUndoGameFinish(game);

        this.ratingService.deleteRatingChangesFromGame(game);
        this.gameRepository.undoFinishGame(gameId, modifiedBy);
        this.undoRemainingRiichiSticksOnFinish(game, event.gameRules, modifiedBy);

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
                modifiedBy
            );
        }
    }

    private validateGameIsInProgress(game: GameWithPlayers, error: (() => BadRequestError)): void {
        if (game.status !== GameStatus.IN_PROGRESS) {
            throw error();
        }
    }

    private validateGameIsFinished(game: GameWithPlayers, error: (() => BadRequestError)): void {
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

    private validateCurrentRoundIdBeforeAdding(rounds: GameRound[], roundId: number): void {
        if (rounds.some((round) => round.roundNumber === roundId)) {
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

    private validateRoundResultPlayers(result: GameRoundResultInputDTO, players: GamePlayer[]): void {
        const playerIds = new Set(players.map((player) => player.userId));

        const validatePlayerId = (playerId: number) => {
            if (!playerIds.has(playerId)) {
                throw new InvalidRoundResultPlayerError(playerId);
            }
        };

        const validatePlayerIds = (ids: number[]) => {
            for (const id of ids) {
                validatePlayerId(id);
            }
        };

        switch (result.type) {
            case 'TSUMO':
                validatePlayerId(result.winningHandData.winnerPlayerId);
                if (result.winningHandData.yakumanLiabilityPlayerId !== undefined) {
                    validatePlayerId(result.winningHandData.yakumanLiabilityPlayerId);
                }
                validatePlayerIds(result.riichiPlayerIds);
                break;
            case 'RON':
                validatePlayerId(result.dealInPlayerId);
                for (const hand of result.winningHandData) {
                    validatePlayerId(hand.winnerPlayerId);
                    if (hand.yakumanLiabilityPlayerId !== undefined) {
                        validatePlayerId(hand.yakumanLiabilityPlayerId);
                    }
                }
                validatePlayerIds(result.riichiPlayerIds);
                break;
            case 'EXHAUSTIVE_DRAW':
                validatePlayerIds(result.riichiPlayerIds);
                validatePlayerIds(result.tenpaiPlayerIds);
                validatePlayerIds(result.nagashiManganPlayerIds);
                break;
            case 'CHOMBO':
                validatePlayerId(result.offenderPlayerId);
                break;
            case 'ABORTIVE_DRAW':
                validatePlayerIds(result.riichiPlayerIds);
                break;
        }
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

        const reversedPointChanges = extraPointChanges.map((change) => ({
            playerId: change.playerId,
            pointChange: -change.pointChange
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
            )
        };

        this.gameRepository.updateGameRoundResult(game.id, lastRound.roundNumber, updatedResult);
        this.gameRepository.applyPlayerPointChanges(game.id, pointChanges, modifiedBy);
        this.gameRepository.touchGame(game.id, modifiedBy);
    }

    validateTrackedGamePlayers(players: TrackedGamePlayerData[], gameRules: GameRules): void {
        if (players.length !== gameRules.numberOfPlayers) {
            throw new IncorrectPlayerCountError(gameRules.numberOfPlayers);
        }

        for (const player of players) {
            this.userService.validateUserIsActiveById(player.userId);
        }

        this.gameService.validateNoDuplicatePlayers(players);
    }

    private logNewTrackedGame(game: GameWithPlayers, event: Event, status: GameStatus): void {
        const user = this.userService.getUserById(game.modifiedBy);
        const message = dedent`
            <b>🎮 New Tracked Game ${status === GameStatus.CREATED ? 'Created' : 'Started'}</b>

            <b>Game ID:</b> <code>${game.id}</code>
            ${this.gameService.formatEventGameLogSection(game, event)}
            <b>Timestamp:</b> <code>${game.createdAt.toISOString()}</code>
            <b>Created by:</b> ${user.name} <code>(ID: ${user.id})</code>

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
            ? `\n\n<b>Point changes removed:</b>\n` + this.printRoundPointChangesLog(deletedRound.result.playerPointChanges)
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
            return `${index + 1}. <b>${user.name}</b> <code>(ID: ${user.id})</code>\n   • Start Place: <b>${p.startPlace}</b>`;
        }).join('\n\n');
    }

    private printRoundPointChangesLog(pointChanges: PlayerPointChange[]): string {
        return pointChanges.map((change) => {
            const user = this.userService.getUserById(change.playerId);
            const sign = change.pointChange >= 0 ? '+' : '';
            return `• <b>${user.name}</b> <code>(ID: ${user.id})</code>: <b>${sign}${change.pointChange}</b>`;
        }).join('\n');
    }

}