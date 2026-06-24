import { t } from '../i18n/index.ts';

export class TelegramReplyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TelegramReplyError';
    }
}

export class UserNotRegisteredTelegramError extends TelegramReplyError {
    constructor() {
        super(t('telegram.errors.userNotRegistered'));
    }
}

export class UserNotClubOwnerTelegramError extends TelegramReplyError {
    constructor() {
        super(t('telegram.errors.userNotClubOwner'));
    }
}

export class UserNotAdminTelegramError extends TelegramReplyError {
    constructor() {
        super(t('telegram.errors.userNotAdmin'));
    }
}

export class NoActiveInvitesTelegramError extends TelegramReplyError {
    constructor() {
        super(t('telegram.errors.noActiveInvites'));
    }
}
