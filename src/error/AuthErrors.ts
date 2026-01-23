import { UnauthorizedError, ForbiddenError } from "./BaseErrors.ts";

export class InvalidInitDataError extends UnauthorizedError {
    constructor(reason: string) {
        super(`Невалідні дані автентифікації Telegram: ${reason}`, 'invalidInitData');
    }
}

export class ExpiredAuthDataError extends UnauthorizedError {
    constructor() {
        super('Термін дії даних автентифікації минув. Будь ласка, перезапустіть додаток.', 'expiredAuthData');
    }
}

export class MissingAuthTokenError extends UnauthorizedError {
    constructor() {
        super('Необхідний токен автентифікації', 'missingAuthToken');
    }
}

export class InvalidAuthTokenError extends UnauthorizedError {
    constructor(reason: string) {
        super(`Невалідний токен автентифікації: ${reason}`, 'invalidAuthToken');
    }
}

export class InsufficientPermissionsError extends ForbiddenError {
    constructor() {
        super('Недостатньо прав для виконання цієї дії', 'insufficientPermissions');
    }
}

export class TokenExpiredError extends UnauthorizedError {
    constructor() {
        super('Термін дії токена автентифікації минув. Перезайдіть в додаток', 'tokenExpired');
    }
}

export class InvalidTokenError extends UnauthorizedError {
    constructor() {
        super('Невалідний токен автентифікації. Перезайдіть в додаток', 'invalidToken');
    }
}
