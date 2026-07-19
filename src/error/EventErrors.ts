import { NotFoundError, BadRequestError, InternalServerError } from './BaseErrors.ts';

export class EventNotFoundError extends NotFoundError {
    constructor(eventId: number) {
        super('eventNotFound', { eventId });
    }
}

export class GameRulesNotFoundError extends NotFoundError {
    constructor(gameRulesId: number) {
        super('gameRulesNotFound', { gameRulesId });
    }
}

export class CannotDeleteGameRulesInUseError extends BadRequestError {
    constructor(gameRulesName: string, eventCount: number) {
        super('cannotDeleteGameRulesInUse', { gameRulesName, eventCount });
    }
}

export class CannotUpdateGameRulesInUseError extends BadRequestError {
    constructor(gameRulesName: string, gameCount: number) {
        super('cannotUpdateGameRulesInUse', { gameRulesName, gameCount });
    }
}

export class CannotDeleteEventWithGamesError extends BadRequestError {
    constructor(eventName: string, gameCount: number) {
        super('cannotDeleteEventWithGames', { eventName, gameCount });
    }
}

export class CannotDeleteEventWithRegistrationsError extends BadRequestError {
    constructor(eventName: string, registrationCount: number) {
        super('cannotDeleteEventWithRegistrations', { eventName, registrationCount });
    }
}

export class CurrentRatingEventMustBeClubScopedError extends BadRequestError {
    constructor() {
        super('currentRatingEventMustBeClubScoped');
    }
}

export class TournamentMustHaveClubError extends BadRequestError {
    constructor() {
        super('tournamentMustHaveClub');
    }
}

export class GameCreationBlockedError extends BadRequestError {
    constructor(eventName: string) {
        super('gameCreationBlocked', { eventName });
    }
}

export class AchievementsOnlyForTournamentsError extends BadRequestError {
    constructor() {
        super('achievementsOnlyForTournaments');
    }
}

export class TournamentConfigRequiredError extends BadRequestError {
    constructor() {
        super('tournamentConfigRequired');
    }
}

export class InvalidEventDateRangeError extends BadRequestError {
    constructor() {
        super('invalidEventDateRange');
    }
}

export class MinParticipantsExceedsMaxError extends BadRequestError {
    constructor() {
        super('minParticipantsExceedsMax');
    }
}

export class ParticipantConfigOnlyForTournamentError extends BadRequestError {
    constructor() {
        super('participantConfigOnlyForTournament');
    }
}

export class TournamentConfigOnlyForTournamentError extends BadRequestError {
    constructor() {
        super('tournamentConfigOnlyForTournament');
    }
}

export class EventIsNotTournamentError extends BadRequestError {
    constructor(eventName: string) {
        super('eventIsNotTournament', { eventName });
    }
}

export class TournamentMisconfigured extends InternalServerError {
    constructor() {
        super('tournamentMisconfigured');
    }
}

export class TournamentTotalRoundsLessThanCurrentRoundError extends BadRequestError {
    constructor(totalRounds: number, currentRound: number) {
        super('tournamentTotalRoundsLessThanCurrentRound', { totalRounds, currentRound });
    }
}

export class TournamentRoundOutOfSequenceError extends BadRequestError {
    constructor(eventName: string, expectedRound: number, requestedRound: number) {
        super('tournamentRoundOutOfSequence', { eventName, expectedRound, requestedRound });
    }
}

export class TournamentRoundNotCurrentError extends BadRequestError {
    constructor(eventName: string, currentRound: number, requestedRound: number) {
        super('tournamentRoundNotCurrent', { eventName, currentRound, requestedRound });
    }
}

export class TournamentRoundNotStartedError extends BadRequestError {
    constructor(eventName: string, requestedRound: number) {
        super('tournamentRoundNotStarted', { eventName, requestedRound });
    }
}

export class TournamentRoundGamesNotFinishedError extends BadRequestError {
    constructor(eventName: string, round: number, unfinishedCount: number) {
        super('tournamentRoundGamesNotFinished', { eventName, round, unfinishedCount });
    }
}

export class TournamentHasNoMoreRoundsError extends BadRequestError {
    constructor(eventName: string) {
        super('tournamentHasNoMoreRounds', { eventName });
    }
}

export class TournamentRoundAlreadyPlayedError extends BadRequestError {
    constructor(eventName: string, round: number, startedCount: number) {
        super('tournamentRoundAlreadyPlayed', { eventName, round, startedCount });
    }
}

export class TournamentAlreadyFinishedError extends BadRequestError {
    constructor(eventName: string) {
        super('tournamentAlreadyFinished', { eventName });
    }
}

export class TournamentNotInLastRoundError extends BadRequestError {
    constructor(eventName: string) {
        super('tournamentNotInLastRound', { eventName });
    }
}

export class TournamentGameNotInCurrentRoundError extends BadRequestError {
    constructor(currentRound: number | null, gameRound: number | null) {
        super('tournamentGameNotInCurrentRound', {
            currentRound: currentRound ?? '-',
            gameRound: gameRound ?? '-',
        });
    }
}

export class SeatingNotEnoughParticipantsError extends BadRequestError {
    constructor(eventName: string, required: number, actual: number) {
        super('seatingNotEnoughParticipants', { eventName, required, actual });
    }
}

export class SeatingParticipantsNotMultipleOfTableSizeError extends BadRequestError {
    constructor(eventName: string, count: number, tableSize: number) {
        super('seatingParticipantsNotMultipleOfTableSize', { eventName, count, tableSize });
    }
}

export class SeatingGenerationFailedError extends BadRequestError {
    constructor(eventName: string) {
        super('seatingGenerationFailed', { eventName });
    }
}

export class SeatingCannotBeModifiedAfterTournamentStartedError extends BadRequestError {
    constructor(eventName: string) {
        super('seatingCannotBeModifiedAfterTournamentStarted', { eventName });
    }
}

export class SeatingAlreadyAppliedError extends BadRequestError {
    constructor(eventName: string) {
        super('seatingAlreadyApplied', { eventName });
    }
}

export class SeatingRoundCountMismatchError extends BadRequestError {
    constructor(eventName: string, expected: number, actual: number) {
        super('seatingRoundCountMismatch', { eventName, expected, actual });
    }
}

export class SeatingTableSizeMismatchError extends BadRequestError {
    constructor(eventName: string, round: number, table: number, expected: number, actual: number) {
        super('seatingTableSizeMismatch', { eventName, round, table, expected, actual });
    }
}

export class SeatingInvalidParticipantError extends BadRequestError {
    constructor(eventName: string, userId: number, round: number) {
        super('seatingInvalidParticipant', { eventName, userId, round });
    }
}

export class SeatingDuplicateParticipantInRoundError extends BadRequestError {
    constructor(eventName: string, userId: number, round: number) {
        super('seatingDuplicateParticipantInRound', { eventName, userId, round });
    }
}

export class SeatingMissingParticipantsInRoundError extends BadRequestError {
    constructor(eventName: string, round: number, expected: number, actual: number) {
        super('seatingMissingParticipantsInRound', { eventName, round, expected, actual });
    }
}

export class SeatingSameTeamAtTableError extends BadRequestError {
    constructor(eventName: string, round: number, table: number) {
        super('seatingSameTeamAtTable', { eventName, round, table });
    }
}

export class InvalidEventFormatForTypeError extends BadRequestError {
    constructor(type: string, format: string) {
        super('invalidEventFormatForType', { type, format });
    }
}

export class TeamConfigOnlyForTeamTournamentError extends BadRequestError {
    constructor() {
        super('teamConfigOnlyForTeamTournament');
    }
}

export class TeamConfigRequiredError extends BadRequestError {
    constructor() {
        super('teamConfigRequired');
    }
}

export class InvalidTeamSizeError extends BadRequestError {
    constructor() {
        super('invalidTeamSize');
    }
}

export class InvalidTeamCountError extends BadRequestError {
    constructor() {
        super('invalidTeamCount');
    }
}

export class TeamCountNotDivisibleByTableSizeError extends BadRequestError {
    constructor(tableSize: number) {
        super('teamCountNotDivisibleByTableSize', { tableSize });
    }
}

export class MinParticipantsRequiredForTeamConfigError extends BadRequestError {
    constructor(expected: number) {
        super('minParticipantsRequiredForTeamConfig', { expected });
    }
}

export class MinParticipantsMustMatchTeamConfigError extends BadRequestError {
    constructor(minParticipants: number, expected: number) {
        super('minParticipantsMustMatchTeamConfig', { minParticipants, expected });
    }
}
