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
    readonly gameRulesName: string;
    readonly eventCount: number;

    constructor(gameRulesName: string, eventCount: number) {
        super(
            `Неможливо видалити правила "${gameRulesName}" — вони використовуються в ${eventCount} подіях`,
            'cannotDeleteGameRulesInUse'
        );
        this.gameRulesName = gameRulesName;
        this.eventCount = eventCount;
    }
}

export class CannotUpdateGameRulesInUseError extends BadRequestError {
    readonly gameRulesName: string;
    readonly eventCount: number;

    constructor(gameRulesName: string, eventCount: number) {
        super(
            `Неможливо оновити правила "${gameRulesName}" — вони використовуються в ${eventCount} подіях`,
            'cannotUpdateGameRulesInUse'
        );
        this.gameRulesName = gameRulesName;
        this.eventCount = eventCount;
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

export class CurrentRatingEventMustBeClubScopedError extends BadRequestError {
    constructor() {
        super('Поточний рейтинговий сезон можна встановити лише для клубної події', 'currentRatingEventMustBeClubScoped');
    }
}

export class CurrentRatingEventMustBeSeasonError extends BadRequestError {
    constructor() {
        super('Поточним рейтинговим сезоном може бути лише подія типу SEASON', 'currentRatingEventMustBeSeason');
    }
}
