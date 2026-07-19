import { BadRequestError, ForbiddenError, NotFoundError } from './BaseErrors.ts';

export class GameNotFoundById extends NotFoundError {
    constructor(id: number) {
        super('gameNotFoundById', { id });
    }
}

export class TooManyGamesFoundError extends BadRequestError {
    constructor() {
        super('tooManyGamesFound');
    }
}

export class IncorrectPlayerCountError extends BadRequestError {
    constructor(requiredPlayers: number) {
        super('incorrectPlayerCount', { requiredPlayers });
    }
}

export class DuplicatePlayerError extends BadRequestError {
    constructor(playerName: string) {
        super('duplicatePlayer', { playerName });
    }
}

export class DuplicateGameTimestampInEventError extends BadRequestError {
    constructor() {
        super('duplicateGameTimestampInEvent');
    }
}

export class DuplicateTournamentRoundTableError extends BadRequestError {
    constructor(tournamentRound: number, tournamentTable: string) {
        super('duplicateTournamentRoundTable', { tournamentRound, tournamentTable });
    }
}

export class IncorrectTotalPointsError extends BadRequestError {
    constructor(expectedTotal: number, actualTotal: number) {
        super('incorrectTotalPoints', { expectedTotal, actualTotal });
    }
}

export class PointsNotWithinRange extends BadRequestError {
    constructor(points: number, minPoints: number, maxPoints: number) {
        super('invalidPoints', { points, minPoints, maxPoints });
    }
}

export class EventHasntStartedError extends BadRequestError {
    constructor(eventName: string) {
        super('eventHasntStarted', { eventName });
    }
}

export class EventHasEndedError extends BadRequestError {
    constructor(eventName: string) {
        super('eventHasEnded', { eventName });
    }
}

export class YouHaveToBeAdminToCreateGameWithCustomTime extends ForbiddenError {
    constructor() {
        super('youHaveToBeAdminToCreateGameWithCustomTime');
    }
}

export class YouHaveToBeAdminToHideNewGameMessage extends ForbiddenError {
    constructor() {
        super('youHaveToBeAdminToHideNewGameMessage');
    }
}

export class GameNotInProgressWhenAddingNewRoundError extends BadRequestError {
    constructor() {
        super('gameNotInProgress');
    }
}

export class GameNotInProgressWhenDeletingRoundError extends BadRequestError {
    constructor() {
        super('gameNotInProgressWhenDeletingRound');
    }
}

export class GameNotInProgressWhenFinishingError extends BadRequestError {
    constructor() {
        super('gameNotInProgressWhenFinishing');
    }
}

export class InvalidRoundIdError extends BadRequestError {
    constructor(expectedRoundId: number, actualRoundId: number) {
        super('invalidRoundId', { expectedRoundId, actualRoundId });
    }
}

export class RoundAlreadyExistsError extends BadRequestError {
    constructor() {
        super('roundAlreadyExists');
    }
}

export class NotAuthorizedToModifyGameError extends ForbiddenError {
    constructor() {
        super('notAuthorizedToModifyGame');
    }
}

export class GamePlayerNotFoundError extends NotFoundError {
    constructor(gameId: number, userId: number) {
        super('gamePlayerNotFound', { gameId, userId });
    }
}

export class NoRoundsToRollbackError extends BadRequestError {
    constructor() {
        super('noRoundsToRollback');
    }
}

export class LastRoundRollbackAlreadyUsedError extends BadRequestError {
    constructor() {
        super('lastRoundRollbackAlreadyUsed');
    }
}

export class NoRoundsCompletedError extends BadRequestError {
    constructor() {
        super('noRoundsCompleted');
    }
}

export class GameNotFinishedWhenUpdatingError extends BadRequestError {
    constructor() {
        super('gameNotFinishedWhenUpdating');
    }
}

export class GameNotFinishedWhenUndoingFinishError extends BadRequestError {
    constructor() {
        super('gameNotFinishedWhenUndoingFinish');
    }
}

export class CannotUndoFinishOnNonTrackedGameError extends BadRequestError {
    constructor() {
        super('cannotUndoFinishOnNonTrackedGame');
    }
}

export class GameNotCreatedWhenStartingError extends BadRequestError {
    constructor() {
        super('gameNotCreatedWhenStarting');
    }
}

export class GameNotCreatedWhenRecordingResultError extends BadRequestError {
    constructor() {
        super('gameNotCreatedWhenRecordingResult');
    }
}

export class PlannedGameResultRosterMismatchError extends BadRequestError {
    constructor() {
        super('plannedGameResultRosterMismatch');
    }
}

export class NotGamePlayerError extends ForbiddenError {
    constructor() {
        super('notGamePlayer');
    }
}
