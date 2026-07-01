import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from './BaseErrors.ts';

export class CannotPairFinishedGameError extends BadRequestError {
    constructor() {
        super('Неможливо підключити Smart Compass до завершеної гри', 'cannotPairFinishedGame');
    }
}

export class InvalidSmartCompassPairingCodeError extends UnauthorizedError {
    constructor() {
        super('Невалідний або прострочений код Smart Compass', 'invalidSmartCompassPairingCode');
    }
}

export class InvalidSmartCompassSessionTokenError extends UnauthorizedError {
    constructor() {
        super('Невалідний токен Smart Compass', 'invalidSmartCompassSessionToken');
    }
}

export class SmartCompassSessionExpiredError extends UnauthorizedError {
    constructor() {
        super('Термін дії сесії Smart Compass минув', 'smartCompassSessionExpired');
    }
}

export class SmartCompassSessionForFinishedGameError extends UnauthorizedError {
    constructor() {
        super('Сесія Smart Compass більше недоступна, бо гру завершено', 'smartCompassSessionForFinishedGame');
    }
}

export class SmartCompassSessionScopeError extends ForbiddenError {
    constructor() {
        super('Токен Smart Compass не має доступу до цієї гри', 'smartCompassSessionScope');
    }
}

export class SmartCompassSessionNotFoundError extends NotFoundError {
    constructor(id: number) {
        super(`Сесію Smart Compass з id ${id} не знайдено`, 'smartCompassSessionNotFound');
    }
}
