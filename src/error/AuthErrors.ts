import type { AuthProvider } from '../model/AuthProviderModels.ts';
import {
    UnauthorizedError,
    ForbiddenError,
    ConflictError,
    InternalServerError,
    ServiceUnavailableError,
} from './BaseErrors.ts';

export class InvalidInitDataError extends UnauthorizedError {
    constructor(reason: string) {
        super('invalidInitData', { reason });
    }
}

export class ExpiredAuthDataError extends UnauthorizedError {
    constructor() {
        super('expiredAuthData');
    }
}

export class MissingAuthTokenError extends UnauthorizedError {
    constructor() {
        super('missingAuthToken');
    }
}

export class InvalidAuthTokenError extends UnauthorizedError {
    constructor(reason: string) {
        super('invalidAuthToken', { reason });
    }
}

export class InsufficientPermissionsError extends ForbiddenError {
    constructor() {
        super('insufficientPermissions');
    }
}

export class TokenExpiredError extends UnauthorizedError {
    constructor() {
        super('tokenExpired');
    }
}

export class InvalidTokenError extends UnauthorizedError {
    constructor() {
        super('invalidToken');
    }
}

export class AuthProviderNotConfiguredError extends InternalServerError {
    constructor(provider: AuthProvider) {
        super('authProviderNotConfigured', { provider });
    }
}

export class InvalidExternalAuthTokenError extends UnauthorizedError {
    constructor(provider: AuthProvider) {
        super('invalidExternalAuthToken', { provider });
    }
}

export class InvalidExternalAuthRegistrationTokenError extends UnauthorizedError {
    constructor() {
        super('invalidExternalAuthRegistrationToken');
    }
}

export class ExternalAuthProviderUnavailableError extends ServiceUnavailableError {
    constructor(provider: AuthProvider) {
        super('externalAuthProviderUnavailable', { provider });
    }
}

export class AuthProviderIdentityAlreadyLinkedError extends ConflictError {
    constructor(provider: AuthProvider) {
        super('authProviderIdentityAlreadyLinked', { provider });
    }
}

export class UserAlreadyHasAuthProviderError extends ConflictError {
    constructor(provider: AuthProvider) {
        super('userAlreadyHasAuthProvider', { provider });
    }
}

export class TelegramAccountAlreadyUsedError extends ConflictError {
    constructor() {
        super('telegramAccountAlreadyUsed');
    }
}
