import { UnauthorizedError, ForbiddenError } from './BaseErrors.ts';

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
