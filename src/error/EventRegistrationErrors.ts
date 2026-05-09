import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from './BaseErrors.ts';
import type { EventRegistrationStatus } from '../model/EventRegistrationModels.ts';

export class EventRegistrationNotFoundError extends NotFoundError {
    constructor(eventName: string, userId: number) {
        super(`Реєстрацію користувача з id ${userId} на подію '${eventName}' не знайдено`, 'eventRegistrationNotFound');
    }
}

export class InvalidEventRegistrationStateError extends BadRequestError {
    constructor(action: string, currentStatus: EventRegistrationStatus, allowedStatuses: EventRegistrationStatus[]) {
        super(
            `Неможливо ${action} реєстрацію зі статусом ${currentStatus}. Дозволені статуси: ${allowedStatuses.join(', ')}`,
            'invalidEventRegistrationState'
        );
    }
}

export class MissingProfileNamesForTournamentRegistrationError extends BadRequestError {
    constructor() {
        super('Для подачі заявки на турнір потрібно заповнити імʼя та прізвище у профілі', 'missingProfileNamesForTournamentRegistration');
    }
}

export class EventCapacityReachedError extends ConflictError {
    constructor(eventName: string, maxParticipants: number) {
        super(
            `Турнір "${eventName}" вже досяг максимальної кількості учасників (${maxParticipants})`,
            'eventCapacityReached'
        );
    }
}

export class InsufficientEventRegistrationManagementPermissionsError extends ForbiddenError {
    constructor() {
        super(
            'Недостатньо прав для управління реєстраціями на цю подію. Потрібна роль адміна або OWNER/MODERATOR клубу події.',
            'insufficientEventRegistrationManagementPermissions'
        );
    }
}
