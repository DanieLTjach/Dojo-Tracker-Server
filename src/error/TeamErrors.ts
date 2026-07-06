import { BadRequestError, ForbiddenError, NotFoundError } from './BaseErrors.ts';

export class TeamNotFoundError extends NotFoundError {
    constructor(teamId: number) {
        super(`Команду з ID ${teamId} не знайдено`, 'teamNotFound');
    }
}

export class TeamNotInEventError extends BadRequestError {
    constructor(teamId: number, eventId: number) {
        super(`Команда ${teamId} не належить події ${eventId}`, 'teamNotInEvent');
    }
}

export class TeamsNotAllowedForFormatError extends BadRequestError {
    constructor(eventName: string) {
        super(`Команди доступні лише для командних подій ("${eventName}")`, 'teamsNotAllowedForFormat');
    }
}

export class InsufficientTeamPermissionsError extends ForbiddenError {
    constructor(eventName: string) {
        super(
            `Недостатньо прав для керування командами турніру "${eventName}"`,
            'insufficientTeamPermissions'
        );
    }
}

export class TeamCountLimitReachedError extends BadRequestError {
    constructor(limit: number) {
        super(`Досягнуто межу кількості команд (${limit})`, 'teamCountLimitReached');
    }
}

export class TeamFullError extends BadRequestError {
    constructor(teamName: string, teamSize: number) {
        super(`Команда "${teamName}" вже заповнена (${teamSize})`, 'teamFull');
    }
}

export class UserAlreadyInTeamForEventError extends BadRequestError {
    constructor(userId: number) {
        super(`Гравець ${userId} вже у команді цієї події`, 'userAlreadyInTeamForEvent');
    }
}

export class UserNotApprovedParticipantError extends BadRequestError {
    constructor(userId: number) {
        super(`Гравець ${userId} не є схваленим учасником турніру`, 'userNotApprovedParticipant');
    }
}

export class TeamCompositionLockedError extends BadRequestError {
    constructor(eventName: string) {
        super(`Склад команд турніру "${eventName}" вже не можна змінювати`, 'teamCompositionLocked');
    }
}

export class TeamMemberNotFoundError extends NotFoundError {
    constructor(teamId: number, userId: number) {
        super(`Гравця ${userId} немає в команді ${teamId}`, 'teamMemberNotFound');
    }
}

export class NotEnoughApprovedForDraftError extends BadRequestError {
    constructor(eventName: string, required: number, approved: number) {
        super(
            `Для старту драфту турніру "${eventName}" потрібно щонайменше ${required} схвалених учасників (наразі ${approved})`,
            'notEnoughApprovedForDraft'
        );
    }
}

export class DraftNotStartableError extends BadRequestError {
    constructor(eventName: string) {
        super(`Драфт турніру "${eventName}" не можна розпочати з поточного стану`, 'draftNotStartable');
    }
}

export class TeamCountMustBeDivisibleByFourError extends BadRequestError {
    constructor(eventName: string, teamCount: number) {
        super(
            `Кількість команд у турнірі "${eventName}" (${teamCount}) має ділитися на 4`,
            'teamCountMustBeDivisibleByFour'
        );
    }
}

export class TeamDraftIncompleteError extends BadRequestError {
    constructor(eventName: string, teamCount: number, teamSize: number) {
        super(
            `Щоб почати командний турнір "${eventName}", сформуйте ${teamCount} повних команд по ${teamSize} гравців`,
            'teamDraftIncomplete'
        );
    }
}
