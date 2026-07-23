import { BadRequestError, NotFoundError } from './BaseErrors.ts';

export class ClubAchievementDefinitionNotFoundError extends NotFoundError {
    constructor(definitionId: number) {
        super('clubAchievementDefinitionNotFound', { definitionId });
    }
}

export class ClubAchievementDefinitionNameAlreadyExistsError extends BadRequestError {
    constructor(name: string) {
        super('clubAchievementDefinitionNameAlreadyExists', { name });
    }
}

export class ClubAchievementDefinitionArchivedError extends BadRequestError {
    constructor(name: string) {
        super('clubAchievementDefinitionArchived', { name });
    }
}

export class ClubAchievementDefinitionFromAnotherClubError extends BadRequestError {
    constructor(definitionId: number) {
        super('clubAchievementDefinitionFromAnotherClub', { definitionId });
    }
}

export class InvalidAchievementSourceError extends BadRequestError {
    constructor() {
        super('invalidAchievementSource');
    }
}

export class UnknownBuiltInAchievementCodeError extends BadRequestError {
    constructor(code: string) {
        super('unknownBuiltInAchievementCode', { code });
    }
}

export class ClubAchievementAlreadyAssignedError extends BadRequestError {
    constructor(userId: number) {
        super('clubAchievementAlreadyAssigned', { userId });
    }
}

export class ClubAchievementAssignmentNotFoundError extends NotFoundError {
    constructor(assignmentId: number) {
        super('clubAchievementAssignmentNotFound', { assignmentId });
    }
}

export class ClubAchievementAssignmentAlreadyRevokedError extends BadRequestError {
    constructor(assignmentId: number) {
        super('clubAchievementAssignmentAlreadyRevoked', { assignmentId });
    }
}

export class TargetNotActiveClubMemberError extends BadRequestError {
    constructor(userId: number) {
        super('targetNotActiveClubMember', { userId });
    }
}
