import { NotFoundError, BadRequestError } from "./BaseErrors.ts";

export class EventNotFoundError extends NotFoundError {
    constructor(eventId: number) {
        super(`Подію з id ${eventId} не знайдено`, 'eventNotFound');
    }
}

export class GameRulesNotFoundError extends NotFoundError {
    constructor(gameRulesId: number) {
        super(`Правила гри з id ${gameRulesId} не знайдено`, 'gameRulesNotFound');
    }
}

export class CannotDeleteGameRulesInUseError extends BadRequestError {
    constructor(gameRulesName: string, eventCount: number) {
        super(
            `Неможливо видалити правила "${gameRulesName}" — вони використовуються в ${eventCount} подіях`,
            'cannotDeleteGameRulesInUse'
        );
    }
}

export class CannotUpdateGameRulesInUseError extends BadRequestError {
    constructor(gameRulesName: string, gameCount: number) {
        super(
            `Неможливо оновити правила "${gameRulesName}" — за ними вже зіграно ${gameCount} ігор`,
            'cannotUpdateGameRulesInUse'
        );
    }
}

export class CannotDeleteEventWithGamesError extends BadRequestError {
    constructor(eventName: string, gameCount: number) {
        super(
            `Неможливо видалити подію з існуючими іграми. Подія "${eventName}" має ${gameCount} ігор`,
            'cannotDeleteEventWithGames'
        );
    }
}

export class CannotDeleteEventWithRegistrationsError extends BadRequestError {
    constructor(eventName: string, registrationCount: number) {
        super(
            `Неможливо видалити подію "${eventName}" — існує ${registrationCount} реєстрацій. Видаліть реєстрації перед видаленням події.`,
            'cannotDeleteEventWithRegistrations'
        );
    }
}

export class CurrentRatingEventMustBeClubScopedError extends BadRequestError {
    constructor() {
        super('Поточний рейтинговий сезон можна встановити лише для клубної події', 'currentRatingEventMustBeClubScoped');
    }
}

export class TournamentMustHaveClubError extends BadRequestError {
    constructor() {
        super('Турнір повинен належати клубу', 'tournamentMustHaveClub');
    }
}

export class GameCreationBlockedError extends BadRequestError {
    constructor(eventName: string) {
        super(`Створення ігор для події "${eventName}" заблоковано`, 'gameCreationBlocked');
    }
}

export class TournamentConfigRequiredError extends BadRequestError {
    constructor() {
        super('Для турніру потрібно вказати налаштування турніру', 'tournamentConfigRequired');
    }
}

export class TournamentConfigOnlyForTournamentError extends BadRequestError {
    constructor() {
        super('Налаштування турніру можна вказувати лише для турнірів', 'tournamentConfigOnlyForTournament');
    }
}

export class EventIsNotTournamentError extends BadRequestError {
    constructor(eventName: string) {
        super(`Подія "${eventName}" не є турніром`, 'eventIsNotTournament');
    }
}

export class TournamentTotalRoundsLessThanCurrentRoundError extends BadRequestError {
    constructor(totalRounds: number, currentRound: number) {
        super(
            `Кількість раундів (${totalRounds}) не може бути меншою за поточний раунд (${currentRound})`,
            'tournamentTotalRoundsLessThanCurrentRound'
        );
    }
}

export class TournamentRoundGamesNotPreparedError extends BadRequestError {
    constructor(eventName: string, round: number) {
        super(`Ігри для раунду ${round} турніру "${eventName}" ще не створені`, 'tournamentRoundGamesNotPrepared');
    }
}

export class TournamentRoundGamesNotFinishedError extends BadRequestError {
    constructor(eventName: string, round: number, unfinishedCount: number) {
        super(
            `У раунді ${round} турніру "${eventName}" ще не завершено ${unfinishedCount} ігор`,
            'tournamentRoundGamesNotFinished'
        );
    }
}

export class TournamentHasNoMoreRoundsError extends BadRequestError {
    constructor(eventName: string) {
        super(`У турнірі "${eventName}" більше немає раундів для запуску`, 'tournamentHasNoMoreRounds');
    }
}

export class TournamentAlreadyFinishedError extends BadRequestError {
    constructor(eventName: string) {
        super(`Турнір "${eventName}" вже завершено`, 'tournamentAlreadyFinished');
    }
}

export class TournamentNotInLastRoundError extends BadRequestError {
    constructor(eventName: string) {
        super(`Турнір "${eventName}" ще не знаходиться в останньому раунді`, 'tournamentNotInLastRound');
    }
}

export class TournamentGameNotInCurrentRoundError extends BadRequestError {
    constructor(currentRound: number | null, gameRound: number | null) {
        super(
            `Цю гру не можна розпочати зараз. Поточний раунд турніру: ${currentRound ?? '—'}, раунд гри: ${gameRound ?? '—'}`,
            'tournamentGameNotInCurrentRound'
        );
    }
}

export class SeatingNotEnoughParticipantsError extends BadRequestError {
    constructor(eventName: string, required: number, actual: number) {
        super(
            `Для розсадки турніру "${eventName}" потрібно щонайменше ${required} учасників (зараз ${actual})`,
            'seatingNotEnoughParticipants'
        );
    }
}

export class SeatingParticipantsNotMultipleOfTableSizeError extends BadRequestError {
    constructor(eventName: string, count: number) {
        super(
            `Кількість учасників турніру "${eventName}" (${count}) має ділитися на 4 для розсадки`,
            'seatingParticipantsNotMultipleOfTableSize'
        );
    }
}

export class SeatingRoundsExceedFeasibleError extends BadRequestError {
    constructor(eventName: string, rounds: number, maxRounds: number) {
        super(
            `Для турніру "${eventName}" неможливо згенерувати ${rounds} раундів без повторів пар (максимум ${maxRounds})`,
            'seatingRoundsExceedFeasible'
        );
    }
}

export class SeatingGenerationFailedError extends BadRequestError {
    constructor(eventName: string) {
        super(
            `Не вдалося згенерувати розсадку для турніру "${eventName}" за відведений час. Спробуйте ще раз`,
            'seatingGenerationFailed'
        );
    }
}

export class SeatingCannotModifyAfterTournamentStartedError extends BadRequestError {
    constructor(eventName: string) {
        super(
            `Розсадку турніру "${eventName}" не можна змінювати після початку турніру`,
            'seatingCannotModifyAfterTournamentStarted'
        );
    }
}

export class SeatingAlreadyAppliedError extends BadRequestError {
    constructor(eventName: string) {
        super(
            `Для турніру "${eventName}" вже створено ігри. Очистіть розсадку перед повторною генерацією`,
            'seatingAlreadyApplied'
        );
    }
}
