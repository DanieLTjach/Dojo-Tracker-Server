import type { TranslationParams } from '../i18n/index.ts';

export class TelegramReplyError extends Error {
    readonly key: string;
    readonly params: TranslationParams | undefined;

    constructor(key: string, params?: TranslationParams) {
        super(key);
        this.name = 'TelegramReplyError';
        this.key = key;
        this.params = params;
    }
}

export class UserNotRegisteredTelegramError extends TelegramReplyError {
    constructor() {
        super('telegram.errors.userNotRegistered');
    }
}

export class UserNotClubOwnerTelegramError extends TelegramReplyError {
    constructor() {
        super('telegram.errors.userNotClubOwner');
    }
}

export class UserNotAdminTelegramError extends TelegramReplyError {
    constructor() {
        super('telegram.errors.userNotAdmin');
    }
}

export class NoActiveInvitesTelegramError extends TelegramReplyError {
    constructor() {
        super('telegram.errors.noActiveInvites');
    }
}
