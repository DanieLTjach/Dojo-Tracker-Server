import dedent from 'dedent';
import LogService from './LogService.ts';
import { GLOBAL_LOGS_LOCALE, globalClubLogsTopic } from '../model/TelegramTopic.ts';
import { SYSTEM_USER_ID } from '../../config/constants.ts';
import type {
    ClubInvite,
    ClubInviteSource,
    ClubInviteType,
    InviteRedemptionResult,
} from '../model/ClubModels.ts';
import type { TelegramUser } from '../model/AuthModels.ts';
import type { User } from '../model/UserModels.ts';
import { ClubInviteRepository } from '../repository/ClubInviteRepository.ts';
import { ClubService } from './ClubService.ts';
import { UserService } from './UserService.ts';
import { ClubMembershipService } from './ClubMembershipService.ts';
import { NameAlreadyTakenByAnotherUser } from '../error/UserErrors.ts';
import {
    InviteExhaustedError,
    InviteExpiredError,
    InviteNotFoundError,
    InviteRevokedError,
    NameRequiredForNewUserError,
} from '../error/ClubErrors.ts';
import { generateInviteCode } from '../util/InviteCodeUtil.ts';
import { t } from '../i18n/index.ts';
import { resolveEffectiveLocale } from '../util/LocaleResolver.ts';

const CODE_GENERATION_ATTEMPTS = 10;
const NAME_COLLISION_ATTEMPTS = 10;

export interface CreateInviteParams {
    clubId: number;
    type: ClubInviteType;
    source: ClubInviteSource;
    label?: string | null;
    maxUses?: number | null;
    expiresAt?: Date | null;
    createdBy: number;
}

export interface InvitePreview extends ClubInvite {
    isRedeemable: boolean;
}

export class ClubInviteService {
    private inviteRepository: ClubInviteRepository = new ClubInviteRepository();
    private clubService: ClubService = new ClubService();
    private userService: UserService = new UserService();
    private membershipService: ClubMembershipService = new ClubMembershipService();

    createInvite(params: CreateInviteParams): ClubInvite {
        this.clubService.validateClubExists(params.clubId);

        const code = this.generateUniqueCode();
        const now = new Date();
        const id = this.inviteRepository.createInvite({
            clubId: params.clubId,
            code,
            type: params.type,
            source: params.source,
            label: params.label ?? null,
            maxUses: params.maxUses ?? null,
            expiresAt: params.expiresAt ?? null,
            isActive: true,
            createdAt: now,
            modifiedAt: now,
            modifiedBy: params.createdBy,
        });

        const invite = this.getInviteById(id);
        this.logInviteCreated(invite, params.createdBy);
        return invite;
    }

    listInvites(clubId: number): ClubInvite[] {
        this.clubService.validateClubExists(clubId);
        return this.inviteRepository.findByClubId(clubId);
    }

    revokeInvite(inviteId: number, modifiedBy: number): ClubInvite {
        this.validateInviteExistsById(inviteId);
        this.inviteRepository.setActive(inviteId, false, modifiedBy);
        const updated = this.getInviteById(inviteId);
        this.logInviteRevoked(updated, modifiedBy);
        return updated;
    }

    getInvitePreview(code: string): InvitePreview {
        const invite = this.inviteRepository.findByCode(code);
        if (invite === undefined) {
            throw new InviteNotFoundError(code);
        }
        return { ...invite, isRedeemable: this.computeRedeemable(invite) };
    }

    redeemInvite(code: string, telegramUser: TelegramUser, name?: string): InviteRedemptionResult {
        const invite = this.inviteRepository.findByCode(code);
        if (invite === undefined) {
            throw new InviteNotFoundError(code);
        }
        if (!invite.isActive) {
            throw new InviteRevokedError();
        }
        if (invite.expiresAt !== null && invite.expiresAt.getTime() <= Date.now()) {
            throw new InviteExpiredError();
        }
        if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) {
            throw new InviteExhaustedError();
        }

        const user = this.resolveOrRegisterUser(telegramUser, name);

        if (invite.type === 'JOIN_CLUB') {
            this.membershipService.createActiveMembership(invite.clubId, user.id, SYSTEM_USER_ID);
        }

        this.recordRedemptionOnce(invite, user.id);

        return {
            type: invite.type,
            clubId: invite.clubId,
            clubName: invite.clubName,
            user,
            nextAction: invite.type === 'REGISTRATION_ONLY' ? 'TUTORIAL' : 'CLUB_HOME',
        };
    }

    private resolveOrRegisterUser(telegramUser: TelegramUser, name?: string): User {
        const existing = this.userService.getOptionalUserByTelegramId(telegramUser.id);
        if (existing !== undefined) {
            return existing;
        }

        const baseName = (name ?? deriveTelegramName(telegramUser)).trim();
        if (baseName.length === 0) {
            throw new NameRequiredForNewUserError();
        }

        const telegramUsername = telegramUser.username ? `@${telegramUser.username}` : undefined;
        return this.registerWithUniqueName(baseName, telegramUsername, telegramUser.id);
    }

    private registerWithUniqueName(baseName: string, telegramUsername: string | undefined, telegramId: number): User {
        for (let attempt = 0; attempt < NAME_COLLISION_ATTEMPTS; attempt++) {
            const candidate = attempt === 0 ? baseName : `${baseName} ${generateInviteCode(4)}`;
            try {
                return this.userService.registerUser(candidate, telegramUsername, telegramId, SYSTEM_USER_ID);
            } catch (error) {
                if (error instanceof NameAlreadyTakenByAnotherUser) {
                    continue;
                }
                throw error;
            }
        }
        throw new NameAlreadyTakenByAnotherUser(baseName);
    }

    private recordRedemptionOnce(invite: ClubInvite, userId: number): void {
        if (this.inviteRepository.findRedemption(invite.id, userId)) {
            return;
        }
        this.inviteRepository.recordRedemption(invite.id, userId, new Date());
        this.inviteRepository.incrementUses(invite.id);
        this.logInviteRedeemed(invite, userId);
    }

    private generateUniqueCode(): string {
        for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPTS; attempt++) {
            const code = generateInviteCode();
            if (!this.inviteRepository.existsByCode(code)) {
                return code;
            }
        }
        throw new Error('Failed to generate a unique invite code');
    }

    getInviteById(id: number): ClubInvite {
        const invite = this.inviteRepository.findById(id);
        if (invite === undefined) {
            throw new InviteNotFoundError(String(id));
        }
        return invite;
    }

    private validateInviteExistsById(id: number): void {
        if (this.inviteRepository.findById(id) === undefined) {
            throw new InviteNotFoundError(String(id));
        }
    }

    private computeRedeemable(invite: ClubInvite): boolean {
        if (!invite.isActive) {
            return false;
        }
        if (invite.expiresAt !== null && invite.expiresAt.getTime() <= Date.now()) {
            return false;
        }
        if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) {
            return false;
        }
        return true;
    }

    private logClubEvent(clubId: number, buildMessage: (locale: string) => string): void {
        LogService.logInfo(buildMessage(GLOBAL_LOGS_LOCALE), globalClubLogsTopic);
        const clubLogsTopic = this.clubService.getClubTelegramTopics(clubId).clubLogs;
        if (clubLogsTopic !== null) {
            const locale = this.resolveClubLocale(clubId);
            LogService.logInfo(buildMessage(locale), clubLogsTopic);
        }
    }

    private resolveClubLocale(clubId: number): string {
        return resolveEffectiveLocale(null, this.clubService.getClubById(clubId));
    }

    private logInviteCreated(invite: ClubInvite, createdBy: number): void {
        const creator = this.userService.getUserById(createdBy);
        this.logClubEvent(invite.clubId, locale => {
            const tr = (key: string) => t(key, {}, locale);
            return dedent`
                <b>${tr('telegram.inviteLog.createdTitle')}</b>

                <b>${tr('telegram.inviteLog.clubLabel')}</b> ${invite.clubName} <code>(ID: ${invite.clubId})</code>
                <b>${tr('telegram.inviteLog.codeLabel')}</b> <code>${invite.code}</code>
                <b>${tr('telegram.inviteLog.typeLabel')}</b> ${invite.type}
                <b>${tr('telegram.inviteLog.sourceLabel')}</b> ${invite.source}${
                invite.label !== null ? `\n<b>${tr('telegram.inviteLog.labelLabel')}</b> ${invite.label}` : ''
            }
                <b>${tr('telegram.inviteLog.createdByLabel')}</b> ${creator.name} <code>(ID: ${creator.id})</code>
            `;
        });
    }

    private logInviteRevoked(invite: ClubInvite, modifiedBy: number): void {
        const modifier = this.userService.getUserById(modifiedBy);
        this.logClubEvent(invite.clubId, locale => {
            const tr = (key: string) => t(key, {}, locale);
            return dedent`
                <b>${tr('telegram.inviteLog.revokedTitle')}</b>

                <b>${tr('telegram.inviteLog.clubLabel')}</b> ${invite.clubName} <code>(ID: ${invite.clubId})</code>
                <b>${tr('telegram.inviteLog.codeLabel')}</b> <code>${invite.code}</code>
                <b>${tr('telegram.inviteLog.revokedByLabel')}</b> ${modifier.name} <code>(ID: ${modifier.id})</code>
            `;
        });
    }

    private logInviteRedeemed(invite: ClubInvite, userId: number): void {
        const user = this.userService.getUserById(userId);
        this.logClubEvent(invite.clubId, locale => {
            const tr = (key: string) => t(key, {}, locale);
            return dedent`
                <b>${tr('telegram.inviteLog.redeemedTitle')}</b>

                <b>${tr('telegram.inviteLog.clubLabel')}</b> ${invite.clubName} <code>(ID: ${invite.clubId})</code>
                <b>${
                tr('telegram.inviteLog.codeLabel')
            }</b> <code>${invite.code}</code> (${invite.type}, ${invite.source})${
                invite.label !== null ? ` — ${invite.label}` : ''
            }
                <b>${tr('telegram.inviteLog.userLabel')}</b> ${user.name} <code>(ID: ${user.id})</code>${
                user.telegramUsername !== null
                    ? `\n<b>${tr('telegram.inviteLog.telegramLabel')}</b> ${user.telegramUsername}`
                    : ''
            }
            `;
        });
    }
}

function deriveTelegramName(telegramUser: TelegramUser): string {
    return [telegramUser.first_name, telegramUser.last_name]
        .filter((part): part is string => part !== undefined && part.trim().length > 0)
        .join(' ');
}
