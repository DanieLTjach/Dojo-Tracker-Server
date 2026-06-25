import type { AuthProvider } from '../model/AuthProviderModels.ts';
import { UnauthorizedError, ForbiddenError, ConflictError, InternalServerError } from './BaseErrors.ts';

export class InvalidInitDataError extends UnauthorizedError {
    constructor(reason: string) {
        super(`Невалідні дані автентифікації Telegram: ${reason}`, 'invalidInitData');
    }
}

export class ExpiredAuthDataError extends UnauthorizedError {
    constructor() {
        super(
            'Термін дії даних автентифікації минув. Будь ласка, закрийте та відкрийте додаток заново.',
            'expiredAuthData'
        );
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

export class AuthProviderNotConfiguredError extends InternalServerError {
    constructor(provider: AuthProvider) {
        super(`Провайдер автентифікації ${provider} не налаштований`, 'authProviderNotConfigured');
    }
}

export class InvalidExternalAuthTokenError extends UnauthorizedError {
    constructor(provider: AuthProvider) {
        super(`Невалідний токен автентифікації ${provider}`, 'invalidExternalAuthToken');
    }
}

export class AuthProviderIdentityAlreadyLinkedError extends ConflictError {
    constructor(provider: AuthProvider) {
        super(
            `Обліковий запис ${provider} вже прив'язаний до іншого користувача`,
            'authProviderIdentityAlreadyLinked'
        );
    }
}

export class UserAlreadyHasAuthProviderError extends ConflictError {
    constructor(provider: AuthProvider) {
        super(`Користувач вже має прив'язаний обліковий запис ${provider}`, 'userAlreadyHasAuthProvider');
    }
}

export class TelegramAccountAlreadyUsedError extends ConflictError {
    constructor() {
        super('Цей Telegram акаунт вже належить іншому користувачу', 'telegramAccountAlreadyUsed');
    }
}
