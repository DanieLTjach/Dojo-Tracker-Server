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

export class CannotDeleteEventWithGamesError extends BadRequestError {
    constructor(eventId: number, gameCount: number) {
        super(
            `Неможливо видалити подію з існуючими іграми. Подія ${eventId} має ${gameCount} ігор`,
            'cannotDeleteEventWithGames'
        );
    }
}
