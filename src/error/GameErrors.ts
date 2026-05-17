import { BadRequestError, ForbiddenError, NotFoundError } from "./BaseErrors.ts";

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
    constructor(playerName: string) {
        super(`Гравець ${playerName} присутній більше одного разу в цій грі`, 'duplicatePlayer');
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

export class PointsNotWithinRange extends BadRequestError {
    constructor(points: number, minPoints: number, maxPoints: number) {
        super(`Очки гравця (${points}) повинні бути в діапазоні від ${minPoints} до ${maxPoints}`, 'invalidPoints');
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

export class YouHaveToBeAdminToCreateGameWithCustomTime extends ForbiddenError {
    constructor() {
        super('Щоб створити гру з заданим часом, ви повинні бути адміністратором', 'youHaveToBeAdminToCreateGameWithCustomTime');
    }
}

export class YouHaveToBeAdminToHideNewGameMessage extends ForbiddenError {
    constructor() {
        super('Щоб сховати повідомлення про нову гру, ви повинні бути адміністратором', 'youHaveToBeAdminToHideNewGameMessage');
    }
}

export class GameNotInProgressError extends BadRequestError {
    constructor() {
        super('Результат раунду можна додати лише до гри, що триває', 'gameNotInProgress');
    }
}

export class InvalidRoundIdError extends BadRequestError {
    constructor(expectedRoundId: number, actualRoundId: number) {
        super(
            `Очікується раунд ${expectedRoundId}, отримано ${actualRoundId}`,
            'invalidRoundId'
        );
    }
}

export class RoundAlreadyExistsError extends BadRequestError {
    constructor() {
        super(`Цей раунд вже завершено`, 'roundAlreadyExists');
    }
}

export class NotAuthorizedToModifyGameError extends ForbiddenError {
    constructor() {
        super(
            'Лише гравці, модератори клубу та адміністратори можуть змінювати гру',
            'notAuthorizedToModifyGame'
        );
    }
}

export class InvalidRoundResultPlayerError extends BadRequestError {
    constructor(playerId: number) {
        super(`Гравець з id ${playerId} не бере участі в цій грі`, 'invalidRoundResultPlayer');
    }
}

export class NoRoundsToRollbackError extends BadRequestError {
    constructor() {
        super('У цій грі немає раундів для відкату', 'noRoundsToRollback');
    }
}

export class LastRoundRollbackAlreadyUsedError extends BadRequestError {
    constructor() {
        super('Ви вже відкатували останній раунд у цій грі', 'lastRoundRollbackAlreadyUsed');
    }
}