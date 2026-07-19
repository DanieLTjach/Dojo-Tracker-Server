import { BadRequestError, ForbiddenError, NotFoundError } from './BaseErrors.ts';

export class TeamNotFoundError extends NotFoundError {
    constructor(teamId: number) {
        super('teamNotFound', { teamId });
    }
}

export class TeamNotInEventError extends BadRequestError {
    constructor(teamId: number, eventId: number) {
        super('teamNotInEvent', { teamId, eventId });
    }
}

export class TeamsNotAllowedForFormatError extends BadRequestError {
    constructor(eventName: string) {
        super('teamsNotAllowedForFormat', { eventName });
    }
}

export class InsufficientTeamPermissionsError extends ForbiddenError {
    constructor(eventName: string) {
        super('insufficientTeamPermissions', { eventName });
    }
}

export class TeamCountLimitReachedError extends BadRequestError {
    constructor(limit: number) {
        super('teamCountLimitReached', { limit });
    }
}

export class TeamFullError extends BadRequestError {
    constructor(teamName: string, teamSize: number) {
        super('teamFull', { teamName, teamSize });
    }
}

export class UserAlreadyInTeamForEventError extends BadRequestError {
    constructor(userId: number) {
        super('userAlreadyInTeamForEvent', { userId });
    }
}

export class UserNotApprovedParticipantError extends BadRequestError {
    constructor(userId: number) {
        super('userNotApprovedParticipant', { userId });
    }
}

export class TeamCompositionLockedError extends BadRequestError {
    constructor(eventName: string) {
        super('teamCompositionLocked', { eventName });
    }
}

export class TeamMemberNotFoundError extends NotFoundError {
    constructor(teamId: number, userId: number) {
        super('teamMemberNotFound', { teamId, userId });
    }
}

export class NotEnoughApprovedForDraftError extends BadRequestError {
    constructor(eventName: string, required: number, approved: number) {
        super('notEnoughApprovedForDraft', { eventName, required, approved });
    }
}

export class DraftNotStartableError extends BadRequestError {
    constructor(eventName: string) {
        super('draftNotStartable', { eventName });
    }
}

export class TeamDraftHasUnteamedPlayersError extends BadRequestError {
    constructor(eventName: string, unteamedCount: number) {
        super('teamDraftHasUnteamedPlayers', { eventName, unteamedCount });
    }
}

export class TeamDraftUnevenTeamsError extends BadRequestError {
    constructor(eventName: string) {
        super('teamDraftUnevenTeams', { eventName });
    }
}

export class TeamCountMustBeDivisibleByTableSizeError extends BadRequestError {
    constructor(eventName: string, teamCount: number, tableSize: number) {
        super('teamCountMustBeDivisibleByTableSize', { eventName, teamCount, tableSize });
    }
}

export class TeamDraftIncompleteError extends BadRequestError {
    constructor(eventName: string, teamCount: number, teamSize: number) {
        super('teamDraftIncomplete', { eventName, teamCount, teamSize });
    }
}
