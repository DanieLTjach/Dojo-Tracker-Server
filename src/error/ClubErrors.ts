import { BadRequestError, ForbiddenError, NotFoundError } from './BaseErrors.ts';
import type { ClubMembershipStatus, ClubRole } from '../model/ClubModels.ts';

export class ClubNotFoundError extends NotFoundError {
    constructor(clubId: number) {
        super(`Клуб з id ${clubId} не знайдено`, 'clubNotFound');
    }
}

export class ClubMembershipNotFoundError extends NotFoundError {
    constructor(clubId: number, userId: number) {
        super(`Учасника з userId ${userId} не знайдено в клубі з id ${clubId}`, 'clubMembershipNotFound');
    }
}

export class ClubNameAlreadyExistsError extends BadRequestError {
    constructor(name: string) {
        super(`Клуб з назвою '${name}' вже існує`, 'clubNameAlreadyExists');
    }
}

export class ClubMembershipAlreadyExistsError extends BadRequestError {
    constructor(clubId: number, userId: number) {
        super(`Користувач з id ${userId} вже є учасником клубу з id ${clubId}`, 'clubMembershipAlreadyExists');
    }
}

export class InsufficientClubPermissionsError extends ForbiddenError {
    constructor(requiredRoles: ClubRole | ClubRole[]) {
        const normalizedRoles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
        const rolesText = normalizedRoles.join(' або ');

        super(`Недостатньо прав для виконання цієї дії. Потрібна роль: ${rolesText}`, 'insufficientClubPermissions');
    }
}

export class InvalidClubMembershipStateError extends BadRequestError {
    constructor(action: string, currentStatus: ClubMembershipStatus, allowedStatuses: ClubMembershipStatus[]) {
        super(
            `Неможливо ${action} учасника клубу зі статусом ${currentStatus}. Дозволені статуси: ${allowedStatuses.join(', ')}`,
            'invalidClubMembershipState'
        );
    }
}
