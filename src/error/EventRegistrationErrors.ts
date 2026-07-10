import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from './BaseErrors.ts';
import type { EventRegistrationStatus } from '../model/EventRegistrationModels.ts';
import type { TranslationParamValue } from '../i18n/index.ts';

export class EventRegistrationNotFoundError extends NotFoundError {
    constructor(eventName: string, userId: number) {
        super('eventRegistrationNotFound', { eventName, userId });
    }
}

export class UserNotRegisteredForTournamentError extends BadRequestError {
    constructor(eventName: string, userId: number) {
        super('userNotRegisteredForTournament', { eventName, userId });
    }
}

export class UserNotApprovedForTournamentError extends BadRequestError {
    constructor(eventName: string, userId: number, status: EventRegistrationStatus) {
        super('userNotApprovedForTournament', { eventName, userId, status });
    }
}

export class InvalidEventRegistrationStateError extends BadRequestError {
    constructor(
        action: TranslationParamValue,
        currentStatus: EventRegistrationStatus,
        allowedStatuses: EventRegistrationStatus[]
    ) {
        super('invalidEventRegistrationState', {
            action,
            currentStatus,
            allowedStatuses: allowedStatuses.join(', '),
        });
    }
}

export class MissingProfileNamesForTournamentRegistrationError extends BadRequestError {
    constructor() {
        super('missingProfileNamesForTournamentRegistration');
    }
}

export class EventCapacityReachedError extends ConflictError {
    constructor(eventName: string, maxParticipants: number) {
        super('eventCapacityReached', { eventName, maxParticipants });
    }
}

export class InsufficientEventRegistrationManagementPermissionsError extends ForbiddenError {
    constructor() {
        super('insufficientEventRegistrationManagementPermissions');
    }
}
