import { BadRequestError, ForbiddenError, NotFoundError } from './BaseErrors.ts';
import type { ClubMembershipStatus, ClubRole } from '../model/ClubModels.ts';
import type { TranslationParamValue } from '../i18n/index.ts';

export class ClubNotFoundError extends NotFoundError {
    constructor(clubId: number) {
        super('clubNotFound', { clubId });
    }
}

export class ClubMembershipNotFoundError extends NotFoundError {
    constructor(clubName: string, userId: number) {
        super('clubMembershipNotFound', { clubName, userId });
    }
}

export class ClubNameAlreadyExistsError extends BadRequestError {
    constructor(name: string) {
        super('clubNameAlreadyExists', { name });
    }
}

export class ClubMembershipAlreadyExistsError extends BadRequestError {
    constructor(clubName: string, userId: number) {
        super('clubMembershipAlreadyExists', { clubName, userId });
    }
}

export class InsufficientClubPermissionsError extends ForbiddenError {
    constructor(requiredRoles: ClubRole | ClubRole[]) {
        const normalizedRoles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
        const rolesText = normalizedRoles.join(', ');

        super('insufficientClubPermissions', { rolesText });
    }
}

export class YouHaveToBeClubMemberError extends ForbiddenError {
    constructor() {
        super('youHaveToBeClubMember');
    }
}

export class YouNeedToBeModeratorToCreateGamesWithNonClubMembersError extends ForbiddenError {
    constructor() {
        super('needModeratorForNonClubMembers');
    }
}

export class InvalidClubMembershipStateError extends BadRequestError {
    constructor(
        action: TranslationParamValue,
        currentStatus: ClubMembershipStatus,
        allowedStatuses: ClubMembershipStatus[]
    ) {
        super('invalidClubMembershipState', { action, currentStatus, allowedStatuses: allowedStatuses.join(', ') });
    }
}

export class InviteNotFoundError extends NotFoundError {
    constructor(code: string) {
        super('inviteNotFound', { code });
    }
}

export class InviteRevokedError extends BadRequestError {
    constructor() {
        super('inviteRevoked');
    }
}

export class InviteExpiredError extends BadRequestError {
    constructor() {
        super('inviteExpired');
    }
}

export class InviteExhaustedError extends BadRequestError {
    constructor() {
        super('inviteExhausted');
    }
}

export class NameRequiredForNewUserError extends BadRequestError {
    constructor() {
        super('nameRequiredForNewUser');
    }
}
