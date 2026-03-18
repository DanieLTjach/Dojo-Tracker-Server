import { BadRequestError, ForbiddenError, NotFoundError } from './BaseErrors.ts';
import type { ClubMembershipStatus, ClubRole } from '../model/ClubModels.ts';

export class ClubNotFoundError extends NotFoundError {
    constructor(clubId: number) {
        super(`Клуб з id ${clubId} не знайдено`, 'clubNotFound');
    }
}

export class ClubMembershipNotFoundError extends NotFoundError {
    constructor(clubName: string, userId: number) {
        super(`Учасника з userId ${userId} не знайдено в клубі '${clubName}'`, 'clubMembershipNotFound');
    }
}

export class ClubNameAlreadyExistsError extends BadRequestError {
    constructor(name: string) {
        super(`Клуб з назвою '${name}' вже існує`, 'clubNameAlreadyExists');
    }
}

export class ClubMembershipAlreadyExistsError extends BadRequestError {
    constructor(clubName: string, userId: number) {
        super(`Користувач з id ${userId} вже є учасником клубу '${clubName}'`, 'clubMembershipAlreadyExists');
    }
}

export class InsufficientClubPermissionsError extends ForbiddenError {
    constructor(requiredRoles: ClubRole | ClubRole[]) {
        const normalizedRoles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
        const rolesText = normalizedRoles.join(' або ');

        super(`Недостатньо прав для виконання цієї дії. Потрібна роль: ${rolesText}`, 'insufficientClubPermissions');
    }
}

export class YouHaveToBeClubMemberError extends ForbiddenError {
    constructor() {
        super('Ви повинні бути учасником клубу для виконання цієї дії', 'youHaveToBeClubMember');
    }
}

export class YouNeedToBeModeratorToCreateGamesWithNonClubMembersError extends ForbiddenError {
    constructor() {
        super('Для створення гри з гравцями, які не є учасниками клубу, потрібна роль OWNER або MODERATOR', 'needModeratorForNonClubMembers');
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
