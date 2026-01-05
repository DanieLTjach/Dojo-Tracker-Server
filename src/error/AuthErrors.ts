import { UnauthorizedError, ForbiddenError } from "./BaseErrors.ts";

export class InvalidInitDataError extends UnauthorizedError {
    constructor(reason: string) {
        super(`Invalid Telegram authentication data: ${reason}`, 'invalidInitData');
    }
}

export class ExpiredAuthDataError extends UnauthorizedError {
    constructor() {
        super('Authentication data has expired. Please restart the app.', 'expiredAuthData');
    }
}

export class MissingAuthTokenError extends UnauthorizedError {
    constructor() {
        super('Authentication token is required', 'missingAuthToken');
    }
}

export class InvalidAuthTokenError extends UnauthorizedError {
    constructor(reason: string) {
        super(`Invalid authentication token: ${reason}`, 'invalidAuthToken');
    }
}

export class InsufficientPermissionsError extends ForbiddenError {
    constructor(action: string) {
        super(`Insufficient permissions to ${action}`, 'insufficientPermissions');
    }
}
