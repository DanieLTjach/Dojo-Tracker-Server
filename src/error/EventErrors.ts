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
