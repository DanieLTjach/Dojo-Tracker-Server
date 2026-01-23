import { BadRequestError, NotFoundError } from "./BaseErrors.ts";

export class GameNotFoundById extends NotFoundError {
    constructor(id: number) {
        super(`Гру з id ${id} не знайдено`, 'gameNotFoundById');
    }
}

export class TooManyGamesFoundError extends BadRequestError {
    constructor() {
        super(`Знайдено забагато ігор. Будь ласка, звузьте критерії пошуку.`, 'tooManyGamesFound');
    }
}

export class IncorrectPlayerCountError extends BadRequestError {
    constructor(requiredPlayers: number) {
        super(`Для гри потрібно ${requiredPlayers} гравців`, 'incorrectPlayerCount');
    }
}

export class DuplicatePlayerError extends BadRequestError {
    constructor(userId: number) {
        super(`Гравець з ID ${userId} присутній більше одного разу в цій грі`, 'duplicatePlayer');
    }
}

export class DuplicateGameTimestampInEventError extends BadRequestError {
    constructor() {
        super('Хтось намагається додати гру одночасно з вами. Будь ласка, спробуйте ще раз', 'duplicateGameTimestampInEvent');
    }
}

export class IncorrectTotalPointsError extends BadRequestError {
    constructor(expectedTotal: number, actualTotal: number) {
        super(`Сума очок повинна дорівнювати ${expectedTotal}, у вас ${actualTotal}`, 'incorrectTotalPoints');
    }
}

export class EventHasntStartedError extends BadRequestError {
    constructor(eventName: string) {
        super(`${eventName} ще не розпочався`, 'eventHasntStarted');
    }
}

export class EventHasEndedError extends BadRequestError {
    constructor(eventName: string) {
        super(`${eventName} вже закінчився`, 'eventHasEnded');
    }
}