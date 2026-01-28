import { NotFoundError, BadRequestError } from "./BaseErrors.ts";

export class GameRulesNotFoundError extends NotFoundError {
    constructor(gameRulesId: number) {
        super(`Правила гри з id ${gameRulesId} не знайдено`, 'gameRulesNotFound');
    }
}

export class CannotDeleteGameRulesInUseError extends BadRequestError {
    constructor(gameRulesId: number) {
        super(`Неможливо видалити правила гри з id ${gameRulesId}, які використовуються подіями з іграми`, 'cannotDeleteGameRulesInUse');
    }
}

export class CannotUpdateGameRulesInUseError extends BadRequestError {
    constructor(gameRulesId: number) {
        super(`Неможливо оновити правила гри з id ${gameRulesId}, які використовуються подіями з іграми`, 'cannotUpdateGameRulesInUse');
    }
}

export class InvalidUmaError extends BadRequestError {
    constructor(message: string) {
        super(message, 'invalidUma');
    }
}
