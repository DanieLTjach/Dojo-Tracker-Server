import { GameRepository } from '../repository/GameRepository.ts';
import { UserService } from '../service/UserService.ts';
import {
    GameNotFoundById,
    IncorrectPlayerCountError,
    DuplicatePlayerError,
    TooManyGamesFoundError,
    IncorrectTotalPointsError,
    EventHasntStartedError,
    EventHasEndedError,
    DuplicateGameTimestampInEventError,
    YouHaveToBeAdminToCreateGameWithCustomTime,
    PointsNotWithinRange,
    YouHaveToBeAdminToHideNewGameMessage,
    GameNotInProgressWhenAddingNewRoundError,
    InvalidRoundIdError,
    RoundAlreadyExistsError,
    NotAuthorizedToModifyGameError,
    InvalidRoundResultPlayerError,
    NoRoundsToRollbackError,
    LastRoundRollbackAlreadyUsedError,
    NoRoundsCompletedError,
    GameNotFinishedWhenUpdatingError,
    GameNotInProgressWhenDeletingRoundError,
    GameNotInProgressWhenFinishingError,
    GameNotFinishedWhenUndoingFinishError,
    CannotUndoFinishOnNonTrackedGameError
} from '../error/GameErrors.ts';
import type { DetailedGame, GameState, GameWithPlayers, PlayerData, GameFilters, GamePlayer, TrackedGamePlayerData, GameRound } from '../model/GameModels.ts';
import { GameStatus } from '../model/GameModels.ts';
import type { GameRoundResult, GameRoundResultInputDTO, PlayerPointChange } from '../model/GameRoundResultModels.ts';
import { EventService } from './EventService.ts';
import type { Event, GameRules } from '../model/EventModels.ts';
import { RatingService } from './RatingService.ts';
import LogService from './LogService.ts';
import dedent from 'dedent';
import type { User } from '../model/UserModels.ts';
import config from '../../config/config.ts';
import { globalGameLogsTopic } from '../model/TelegramTopic.ts';
import {
    InsufficientClubPermissionsError,
    YouHaveToBeClubMemberError,
    YouNeedToBeModeratorToCreateGamesWithNonClubMembersError
} from '../error/ClubErrors.ts';
import { InsufficientPermissionsError } from '../error/AuthErrors.ts';
import type { ClubRole } from '../model/ClubModels.ts';
import { ClubService } from './ClubService.ts';
import { ClubMembershipService } from './ClubMembershipService.ts';
import {
    calculateGameRoundResult,
    calculateRemainingRiichiSticksPointChanges,
    mergePlayerPointChanges
} from '../util/PointCalculationUtil.ts';
import { BadRequestError } from '../error/BaseErrors.ts';

export class GameService {

    private gameRepository: GameRepository = new GameRepository();
    private userService: UserService = new UserService();
    private eventService: EventService = new EventService();
    private ratingService: RatingService = new RatingService();
    private clubService: ClubService = new ClubService();
    private clubMembershipService: ClubMembershipService = new ClubMembershipService();

    addGame(
        eventId: number,
        playersData: PlayerData[],
        createdBy: number,
        createdAt: Date | undefined,
        hideNewGameMessage: boolean,
        tournamentRound: number | null,
        tournamentTable: string | null
    ): GameWithPlayers {
        const gameTimestamp = createdAt ?? new Date();
        if (createdAt !== undefined) {
            this.userService.validateUserIsAdmin(createdBy, () => new YouHaveToBeAdminToCreateGameWithCustomTime());
        }
        if (hideNewGameMessage !== false) {
            this.userService.validateUserIsAdmin(createdBy, () => new YouHaveToBeAdminToHideNewGameMessage());
        }

        const event = this.eventService.getEventById(eventId);
        this.authorizeGameCreation(event, playersData, createdBy);
        this.validatePlayers(playersData, event.gameRules);
        this.validateGameWithinEventDates(event, gameTimestamp, createdBy);
        this.validateNoDuplicateGameTimestamp(eventId, gameTimestamp);

        const standingsBefore = this.ratingService.calculateStandings(eventId);

        const newGameId = this.gameRepository.createGame(eventId, createdBy, gameTimestamp, tournamentRound, tournamentTable);
        this.addPlayersToGame(newGameId, playersData, createdBy);
        this.ratingService.addRatingChangesFromGame(newGameId, gameTimestamp, playersData, eventId, event.gameRules, event.startingRating);

        const standingsAfter = this.ratingService.calculateStandings(eventId);

        const newGame = this.getGameById(newGameId);
        this.logNewGame(newGame, event);
        if (!hideNewGameMessage) {
            this.logRatingUpdateForGame(newGame, event, standingsBefore, standingsAfter, createdBy);
        }
        return newGame;
    }

    addTrackedGame(eventId: number, players: TrackedGamePlayerData[], createdBy: number): DetailedGame {
        const gameTimestamp = new Date();

        const event = this.eventService.getEventById(eventId);
        this.authorizeGameCreation(event, players, createdBy);
        this.validateTrackedGamePlayers(players, event.gameRules);
        this.validateGameWithinEventDates(event, gameTimestamp, createdBy);
        this.validateNoDuplicateGameTimestamp(eventId, gameTimestamp);

        const newGameId = this.gameRepository.createTrackedGame(eventId, createdBy, gameTimestamp);
        this.addPlayersToTrackedGame(newGameId, players, event.gameRules.startingPoints, createdBy);

        const newGame = this.getDetailedGameById(newGameId);
        this.logNewTrackedGame(newGame, event);
        return newGame;
    }

    getGameById(gameId: number): GameWithPlayers {
        const game = this.gameRepository.findGameById(gameId);
        if (!game) {
            throw new GameNotFoundById(gameId);
        }

        return {
            ...game,
            players: this.gameRepository.findGamePlayersByGameId(gameId)
        };
    }

    getDetailedGameById(gameId: number): DetailedGame {
        const game = this.getGameById(gameId);
        const rounds = this.gameRepository.findGameRoundsByGameId(gameId);

        return {
            ...game,
            rounds,
            currentState: this.calculateCurrentGameState(game, rounds)
        };
    }

    addGameRoundResult(
        gameId: number,
        roundId: number,
        resultInputDTO: GameRoundResultInputDTO,
        modifiedBy: number
    ): DetailedGame {
        const game = this.getDetailedGameById(gameId);
        const event = this.eventService.getEventById(game.eventId);

        this.authorizeTrackedGameAction(game, event, modifiedBy);
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
            : this.getDetailedGameById(gameId);
    }

    deleteGameRoundResult(gameId: number, roundId: number, modifiedBy: number): DetailedGame {
        const game = this.getDetailedGameById(gameId);
        const event = this.eventService.getEventById(game.eventId);

        this.authorizeTrackedGameAction(game, event, modifiedBy);
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

        const updatedGame = this.getDetailedGameById(gameId);
        this.logGameRoundRollback(updatedGame, event, lastRound, modifiedBy);
        return updatedGame;
    }

    finishGame(gameId: number, modifiedBy: number): DetailedGame {
        const game = this.getDetailedGameById(gameId);
        const event = this.eventService.getEventById(game.eventId);

        this.authorizeTrackedGameAction(game, event, modifiedBy);
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

        const finishedGame = this.getDetailedGameById(gameId);
        this.logGameAction(finishedGame, event, modifiedBy, '✅ Game Finished', 'Finished by');
        this.logRatingUpdateForGame(
            finishedGame,
            event,
            standingsBefore,
            this.ratingService.calculateStandings(event.id),
            modifiedBy
        );

        return finishedGame;
    }

    undoFinishGame(gameId: number, modifiedBy: number): DetailedGame {
        const game = this.getDetailedGameById(gameId);
        const event = this.eventService.getEventById(game.eventId);

        this.authorizeClubScopedAction(event.clubId, modifiedBy, ['OWNER', 'MODERATOR']); 
        this.validateCanUndoGameFinish(game);

        this.ratingService.deleteRatingChangesFromGame(game);
        this.gameRepository.undoFinishGame(gameId, modifiedBy);
        this.undoRemainingRiichiSticksOnFinish(game, event.gameRules, modifiedBy);

        const reopenedGame = this.getDetailedGameById(gameId);
        this.logGameAction(reopenedGame, event, modifiedBy, '↩️ Game Finish Undone', 'Undone by');
        return reopenedGame;
    }

    getGames(filters: GameFilters): GameWithPlayers[] {
        this.validateGameFilters(filters);

        const games = this.gameRepository.findGames(filters);

        if (games.length > 100) {
            throw new TooManyGamesFoundError();
        }

        const gamePlayers = this.gameRepository.findGamePlayersByGameIds(games.map(g => g.id));

        return games.map(game => ({
            ...game,
            players: gamePlayers.filter(gp => gp.gameId === game.id)
        }));
    }

    updateGame(
        gameId: number,
        eventId: number,
        playersData: PlayerData[],
        modifiedBy: number,
        createdAt: Date | undefined,
        tournamentRound: number | null,
        tournamentTable: string | null
    ): GameWithPlayers {
        const oldGame = this.getGameById(gameId);
        const oldEvent = this.eventService.getEventById(oldGame.eventId);
        if (oldGame.status !== GameStatus.FINISHED) {
            throw new GameNotFinishedWhenUpdatingError();
        }
        this.authorizeClubScopedAction(oldEvent.clubId, modifiedBy, ['OWNER', 'MODERATOR']);

        const event = this.eventService.getEventById(eventId);
        if (event.id !== oldEvent.id) {
            this.authorizeClubScopedAction(event.clubId, modifiedBy, ['OWNER', 'MODERATOR']);
        }
        this.validatePlayers(playersData, event.gameRules);

        const newGameTimestamp = createdAt ?? oldGame.createdAt;

        this.gameRepository.updateGame(gameId, eventId, modifiedBy, newGameTimestamp, tournamentRound, tournamentTable);
        this.gameRepository.deleteGamePlayersByGameId(gameId);
        this.addPlayersToGame(gameId, playersData, modifiedBy);

        this.ratingService.deleteRatingChangesFromGame(oldGame);
        this.ratingService.addRatingChangesFromGame(gameId, newGameTimestamp, playersData, eventId, event.gameRules, event.startingRating);

        const updatedGame = this.getGameById(gameId);
        this.logEditedGame(oldGame, updatedGame, event, modifiedBy);
        return updatedGame;
    }

    deleteGame(gameId: number, deletedBy: number): void {
        const game = this.getGameById(gameId);
        const event = this.eventService.getEventById(game.eventId);
        const rounds = this.gameRepository.findGameRoundsByGameId(gameId);

        this.authorizeGameDeletion(game, event, deletedBy, rounds.length);

        this.ratingService.deleteRatingChangesFromGame(game);

        this.gameRepository.deleteGameRoundsByGameId(gameId);
        this.gameRepository.deleteGamePlayersByGameId(gameId);
        this.gameRepository.deleteGameById(gameId);

        this.logDeletedGame(game, event, deletedBy);
    }

    private authorizeGameDeletion(
        game: GameWithPlayers,
        event: Event,
        userId: number,
        roundCount: number
    ): void {
        const user = this.userService.getUserById(userId);
        if (user.isAdmin) {
            return;
        }

        if (game.status === GameStatus.FINISHED) {
            this.authorizeClubScopedAction(event.clubId, userId, ['OWNER']);
            return;
        }

        if (roundCount > 0) {
            this.authorizeClubScopedAction(event.clubId, userId, ['OWNER', 'MODERATOR']);
            return;
        }

        if (event.type === 'TOURNAMENT') {
            this.authorizeClubScopedAction(event.clubId, userId, ['OWNER', 'MODERATOR']);
            return;
        }
        
        this.authorizeTrackedGameAction(game, event, userId);
    }

    private authorizeGameCreation(event: Event, playersData: Array<{ userId: number }>, createdBy: number): void {
        const user = this.userService.getUserById(createdBy);
        if (user.isAdmin || event.clubId === null) {
            return;
        }

        const creatorRole = this.clubMembershipService.getUserClubRole(event.clubId, createdBy);
        if (!creatorRole) {
            throw new YouHaveToBeClubMemberError();
        }

        if (creatorRole === 'MEMBER') {
            const allPlayersInClub = playersData.every((player) => this.clubMembershipService.getUserClubRole(event.clubId!, player.userId) !== undefined);
            if (!allPlayersInClub) {
                throw new YouNeedToBeModeratorToCreateGamesWithNonClubMembersError();
            }
        }
    }

    private authorizeTrackedGameAction(game: GameWithPlayers, event: Event, userId: number): void {
        const user = this.userService.getUserById(userId);
        if (user.isAdmin) {
            return;
        }

        if (game.players.some((player) => player.userId === userId)) {
            return;
        }

        if (event.clubId !== null) {
            const role = this.clubMembershipService.getUserClubRole(event.clubId, userId);
            if (role === 'OWNER' || role === 'MODERATOR') {
                return;
            }
        }

        throw new NotAuthorizedToModifyGameError();
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

    private calculateCurrentGameState(game: GameWithPlayers, rounds: GameRound[]): GameState | null {
        if (game.status !== GameStatus.IN_PROGRESS) {
            return null;
        }

        if (rounds.length === 0) {
            return { wind: 'EAST', dealerNumber: 1, counters: 0, riichiSticks: 0 };
        }

        return rounds[rounds.length - 1]!.result.nextState ?? null;
    }

    private authorizeClubScopedAction(clubId: number | null, userId: number, allowedRoles: ClubRole[]): void {
        const user = this.userService.getUserById(userId);
        if (user.isAdmin) {
            return;
        }

        if (clubId === null) {
            throw new InsufficientPermissionsError();
        }

        const role = this.clubMembershipService.getUserClubRole(clubId, userId);
        if (role === undefined || !allowedRoles.includes(role)) {
            throw new InsufficientClubPermissionsError(allowedRoles);
        }
    }

    private logNewGame(game: GameWithPlayers, event: Event): void {
        this.logGameAction(game, event, game.modifiedBy, '🎮 New Game Added', 'Created by');
    }

    private logNewTrackedGame(game: GameWithPlayers, event: Event): void {
        const user = this.userService.getUserById(game.modifiedBy);
        const message = dedent`
            <b>🎮 New Tracked Game Started</b>

            <b>Game ID:</b> <code>${game.id}</code>
            <b>Event:</b> ${event.name} <code>(ID: ${event.id})</code>
            <b>Timestamp:</b> <code>${game.createdAt.toISOString()}</code>
            <b>Created by:</b> ${user.name} <code>(ID: ${user.id})</code>

            <b>Players:</b>\n
        ` + this.printTrackedGamePlayersLog(game.players);
        this.logMessageToGameLogsTopics(message, event);
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
            <b>Event:</b> ${event.name} <code>(ID: ${event.id})</code>
            <b>Round:</b> <code>${deletedRound.wind} ${deletedRound.dealerNumber} Repeat ${deletedRound.counters} (${deletedRound.roundNumber})</code>
            <b>Result type:</b> <code>${deletedRound.result.type}</code>
            <b>Rolled back by:</b> ${user.name} <code>(ID: ${user.id})</code>
        ` + pointChangesSection;
        this.logMessageToGameLogsTopics(message, event);
    }

    private logEditedGame(oldGame: GameWithPlayers, newGame: GameWithPlayers, event: Event, modifiedBy: number): void {
        const user = this.userService.getUserById(modifiedBy);

        const oldEvent = this.eventService.getEventById(oldGame.eventId);
        const changes: string[] = [];
        if (oldEvent.id !== event.id) {
            changes.push(`<b>Event:</b> ${oldEvent.name} <code>(ID: ${oldEvent.id})</code> → ${event.name} <code>(ID: ${event.id})</code>`);
        }
        if (oldGame.createdAt.toISOString() !== newGame.createdAt.toISOString()) {
            changes.push(`<b>Timestamp:</b> <code>${oldGame.createdAt.toISOString()}</code> → <code>${newGame.createdAt.toISOString()}</code>`);
        }

        const playersChanged = this.havePlayersChanged(oldGame.players, newGame.players);

        let message = dedent`
            <b>✏️ Game Edited</b>

            <b>Game ID:</b> <code>${newGame.id}</code>
            <b>Event:</b> ${event.name} <code>(ID: ${event.id})</code>
        `;

        if (changes.length > 0) {
            message += '\n' + changes.join('\n');
        }

        message += `\n<b>Edited by:</b> ${user.name} <code>(ID: ${user.id})</code>`;

        if (playersChanged) {
            message += `\n\n<b>Players (Before):</b>\n` + this.printPlayersLog(oldGame.players);
            message += `\n\n<b>Players (After):</b>\n` + this.printPlayersLog(newGame.players);
        }

        this.logMessageToGameLogsTopics(message, event);
    }

    private havePlayersChanged(oldPlayers: GamePlayer[], newPlayers: GamePlayer[]): boolean {
        if (oldPlayers.length !== newPlayers.length) return true;
        const oldSorted = [...oldPlayers].sort((a, b) => a.userId - b.userId);
        const newSorted = [...newPlayers].sort((a, b) => a.userId - b.userId);
        return oldSorted.some((old, i) => {
            const n = newSorted[i]!;
            return old.userId !== n.userId || old.points !== n.points || old.startPlace !== n.startPlace || old.chomboCount !== n.chomboCount;
        });
    }

    private logDeletedGame(game: GameWithPlayers, event: Event, deletedBy: number): void {
        this.logGameAction(game, event, deletedBy, '🗑️ Game Deleted', 'Deleted by');
    }

    private logGameAction(
        game: GameWithPlayers,
        event: Event,
        userId: number,
        title: string,
        userLabel: string
    ): void {
        const user = this.userService.getUserById(userId);
        const message = dedent`
            <b>${title}</b>

            <b>Game ID:</b> <code>${game.id}</code>
            <b>Event:</b> ${event.name} <code>(ID: ${event.id})</code>
            <b>Timestamp:</b> <code>${game.createdAt.toISOString()}</code>
            <b>${userLabel}:</b> ${user.name} <code>(ID: ${user.id})</code>

            <b>Players:</b>\n
        ` + this.printPlayersLog(game.players);
        this.logMessageToGameLogsTopics(message, event);
    }

    private logMessageToGameLogsTopics(message: string, event: Event) {
        let clubPrefix = '';
        if (event.clubId !== null) {
            const club = this.clubService.getClubById(event.clubId);
            clubPrefix = `<b>${club.name} club</b>\n `;
            LogService.logInfo(message, this.clubService.getClubTelegramTopics(event.clubId).gameLogs);
        }
        LogService.logInfo(clubPrefix + message, globalGameLogsTopic);
    }

    private printPlayersLog(players: GamePlayer[]): string {
        return players.map((p, index) => {
            const user = this.userService.getUserById(p.userId);
            const ratingSign = p.ratingChange >= 0 ? '+' : '';

            let userDescription = `${index + 1}. <b>${user.name}</b> <code>(ID: ${user.id})</code>`;
            userDescription += `\n   • Points: <b>${p.points}</b>`;
            if (p.startPlace !== null) {
                userDescription += `\n   • Start Place: <b>${p.startPlace}</b>`;
            }
            if (p.chomboCount > 0) {
                userDescription += `\n   • Chombo Count: <b>${p.chomboCount}</b>`;
            }
            userDescription += `\n   • Rating: <b>${ratingSign}${p.ratingChange}</b>`;
            return userDescription;
        }).join('\n\n');
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

    private logRatingUpdateForGame(
        game: GameWithPlayers,
        event: Event,
        standingsBefore: Map<number, number>,
        standingsAfter: Map<number, number>,
        createdBy: number
    ): void {
        // Sort players by points descending (as they were ranked in the game)
        const sortedPlayers = [...game.players].sort((a, b) => b.points - a.points);

        const maxPlayerPointsStringLength = Math.max(...sortedPlayers.map(p => p.points.toString().length));
        const maxPlayerRatingChangeStringLength = Math.max(
            ...sortedPlayers.map(p => this.signedNumberToString(p.ratingChange).length)
        );
        const padding = Math.max(maxPlayerPointsStringLength, maxPlayerRatingChangeStringLength) + 1;

        const playerLines = sortedPlayers.map((player, index) => {
            const user = this.userService.getUserById(player.userId);
            const standingBefore = standingsBefore.get(player.userId) ?? NaN;
            const standingAfter = standingsAfter.get(player.userId) ?? NaN;

            let standingString = '';
            if (standingAfter < standingBefore) {
                standingString = `↗️ (${standingBefore} → ${standingAfter})`;
            } else if (standingAfter > standingBefore) {
                standingString = `↘️ (${standingBefore} → ${standingAfter})`;
            } else if (standingAfter === standingBefore) {
                standingString = `⏺️ (${standingBefore})`;
            } else if (Number.isNaN(standingBefore) && !Number.isNaN(standingAfter)) {
                standingString = `🆕 (${standingAfter})`;
            }

            return `<code>${index + 1}.${player.points.toString().padStart(padding, ' ')}</code>`
                + ` | ${this.generateUserProfileLink(user)}\n`
                + `<code>${this.signedNumberToString(player.ratingChange).padStart(padding + 2, ' ')}</code>`
                + (standingString ? ` | ${standingString}` : '');
        }).join('\n\n');

        const createdByUser = this.userService.getUserById(createdBy);
        const message = `<a href="${config.botUrl}?startapp=event_${event.id}"><b>${event.name}</b></a>`
            + `\nДодано <a href="${config.botUrl}?startapp=game_${game.id}"><b>нову гру</b></a>`
            + ` користувачем ${this.generateUserProfileLink(createdByUser)}\n\n`
            + `${playerLines}`;

        if (event.clubId !== null) {
            LogService.logInfo(message, this.clubService.getClubTelegramTopics(event.clubId).rating);
        }
    }

    private signedNumberToString(num: number): string {
        return num >= 0 ? `+${num}` : `${num}`;
    }

    private generateUserProfileLink(user: User): string {
        return `<a href="${config.botUrl}?startapp=user_${user.id}"><b>${user.name}</b></a>`;
    }

    private validateGameFilters(filters: GameFilters): void {
        if (filters?.userId !== undefined) {
            this.userService.validateUserExistsById(filters.userId);
        }
        if (filters?.eventId !== undefined) {
            this.eventService.validateEventExists(filters.eventId);
        }
    }

    validateTrackedGamePlayers(players: TrackedGamePlayerData[], gameRules: GameRules): void {
        if (players.length !== gameRules.numberOfPlayers) {
            throw new IncorrectPlayerCountError(gameRules.numberOfPlayers);
        }

        for (const player of players) {
            this.userService.validateUserIsActiveById(player.userId);
        }

        this.validateNoDuplicatePlayers(players);
    }

    validatePlayers(playersData: PlayerData[], gameRules: GameRules): void {
        if (playersData.length !== gameRules.numberOfPlayers) {
            throw new IncorrectPlayerCountError(gameRules.numberOfPlayers);
        }

        for (const playerData of playersData) {
            this.userService.validateUserIsActiveById(playerData.userId);
        }

        this.validateNoDuplicatePlayers(playersData);
        this.validateTotalPoints(playersData, gameRules);
        this.validatePoints(playersData);
    }

    private addPlayersToGame(gameId: number, players: PlayerData[], modifiedBy: number): void {
        for (const player of players) {
            this.gameRepository.addGamePlayer(
                gameId,
                player.userId,
                player.points,
                player.startPlace ?? undefined,
                player.chomboCount ?? 0,
                modifiedBy
            );
        }
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

    private validateNoDuplicatePlayers(players: Array<{ userId: number }>): void {
        const userIds = players.map(p => p.userId);
        const uniqueUserIds = new Set(userIds);

        if (uniqueUserIds.size !== userIds.length) {
            const seen = new Set<number>();
            for (const player of players) {
                if (seen.has(player.userId)) {
                    const user = this.userService.getUserById(player.userId);
                    throw new DuplicatePlayerError(user.name);
                }
                seen.add(player.userId);
            }
        }
    }

    private validateTotalPoints(playersData: PlayerData[], gameRules: GameRules): void {
        const totalPoints = playersData.reduce((sum, player) => sum + player.points, 0);
        const expectedTotal = gameRules.numberOfPlayers * gameRules.startingPoints;

        if (totalPoints !== expectedTotal) {
            throw new IncorrectTotalPointsError(expectedTotal, totalPoints);
        }
    }

    private validatePoints(playersData: PlayerData[]): void {
        for (const player of playersData) {
            if (Math.abs(player.points) > MAX_POINTS) {
                throw new PointsNotWithinRange(player.points, -MAX_POINTS, MAX_POINTS);
            }
        }
    }

    private validateGameWithinEventDates(event: Event, gameTimestamp: Date, createdBy: number): void {
        if (event.dateFrom !== null && gameTimestamp < event.dateFrom) {
            throw new EventHasntStartedError(event.name);
        }
        if (event.dateTo !== null && gameTimestamp > event.dateTo) {
            const user = this.userService.getUserById(createdBy);
            if (!user.isAdmin) {
                throw new EventHasEndedError(event.name);
            }
        }
    }

    // rating calculation relies on unique game timestamps within an event
    private validateNoDuplicateGameTimestamp(eventId: number, timestamp: Date): void {
        const existingGame = this.gameRepository.findGameByEventAndTimestamp(eventId, timestamp);
        if (existingGame !== undefined) {
            throw new DuplicateGameTimestampInEventError();
        }
    }
}

const MAX_POINTS = 1_000_000;
