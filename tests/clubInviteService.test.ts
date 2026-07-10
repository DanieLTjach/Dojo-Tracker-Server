import { ClubInviteService } from '../src/service/ClubInviteService.ts';
import { ClubInviteRepository } from '../src/repository/ClubInviteRepository.ts';
import { ClubMembershipRepository } from '../src/repository/ClubMembershipRepository.ts';
import { ClubRepository } from '../src/repository/ClubRepository.ts';
import { UserService } from '../src/service/UserService.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import type { TelegramUser } from '../src/model/AuthModels.ts';
import {
    InviteExhaustedError,
    InviteExpiredError,
    InviteNotFoundError,
    InviteRevokedError,
    NameRequiredForNewUserError,
} from '../src/error/ClubErrors.ts';

const SYSTEM_USER_ID = 0;
const TELEGRAM_BASE = 9400000;

function telegramUser(idOffset: number, extra: Partial<TelegramUser> = {}): TelegramUser {
    return { id: TELEGRAM_BASE + idOffset, ...extra };
}

describe('ClubInviteService', () => {
    const inviteService = new ClubInviteService();
    const inviteRepository = new ClubInviteRepository();
    const membershipRepository = new ClubMembershipRepository();
    const clubRepository = new ClubRepository();
    const userService = new UserService();
    let clubId: number;

    function cleanupInvites(): void {
        dbManager.db.prepare(
            'DELETE FROM clubInviteRedemption WHERE inviteId IN (SELECT id FROM clubInvite WHERE clubId = ?)'
        ).run(clubId);
        dbManager.db.prepare('DELETE FROM clubInvite WHERE clubId = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM user WHERE telegramId >= ? AND telegramId < ?').run(
            TELEGRAM_BASE,
            TELEGRAM_BASE + 100000
        );
    }

    beforeAll(() => {
        clubId = clubRepository.createClub({
            name: 'Invite Service Club',
            address: null,
            city: null,
            country: 'UA',
            locale: 'uk',
            description: null,
            contactInfo: null,
            isActive: true,
            createdAt: new Date('2026-04-01T10:00:00.000Z'),
            modifiedBy: SYSTEM_USER_ID,
        });
    });

    afterEach(() => cleanupInvites());

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(clubId);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    function createInvite(overrides: Partial<Parameters<ClubInviteService['createInvite']>[0]> = {}) {
        return inviteService.createInvite({
            clubId,
            type: 'JOIN_CLUB',
            source: 'FESTIVAL',
            createdBy: SYSTEM_USER_ID,
            ...overrides,
        });
    }

    it('creates an active invite with a generated 10-character code', () => {
        const invite = createInvite();
        expect(invite.code).toHaveLength(10);
        expect(invite.isActive).toBe(true);
        expect(invite.usesCount).toBe(0);
        expect(inviteRepository.findByCode(invite.code)).toBeDefined();
    });

    it('revokes an invite', () => {
        const invite = createInvite();
        const revoked = inviteService.revokeInvite(invite.id, SYSTEM_USER_ID);
        expect(revoked.isActive).toBe(false);
    });

    it('JOIN_CLUB redeem registers a new user as an ACTIVE member and counts the use', () => {
        const invite = createInvite({ type: 'JOIN_CLUB' });
        const result = inviteService.redeemInvite(invite.code, telegramUser(1, { first_name: 'Akagi' }));

        expect(result.type).toBe('JOIN_CLUB');
        expect(result.nextAction).toBe('CLUB_HOME');
        expect(result.user.name).toBe('Akagi');

        const membership = membershipRepository.findMembership(clubId, result.user.id);
        expect(membership?.status).toBe('ACTIVE');
        expect(membership?.role).toBe('MEMBER');
        expect(inviteRepository.findById(invite.id)!.usesCount).toBe(1);
    });

    it('JOIN_CLUB redeem by the same user is idempotent and does not double-count', () => {
        const invite = createInvite({ type: 'JOIN_CLUB' });
        const tg = telegramUser(2, { first_name: 'Washizu' });

        inviteService.redeemInvite(invite.code, tg);
        const second = inviteService.redeemInvite(invite.code, tg);

        expect(second.nextAction).toBe('CLUB_HOME');
        expect(inviteRepository.findById(invite.id)!.usesCount).toBe(1);
    });

    it('REGISTRATION_ONLY redeem registers the user without a membership and routes to the tutorial', () => {
        const invite = createInvite({ type: 'REGISTRATION_ONLY' });
        const result = inviteService.redeemInvite(invite.code, telegramUser(3, { first_name: 'Hatsumi' }));

        expect(result.nextAction).toBe('TUTORIAL');
        expect(membershipRepository.findMembership(clubId, result.user.id)).toBeUndefined();
    });

    it('derives the name from Telegram first and last name', () => {
        const invite = createInvite({ type: 'REGISTRATION_ONLY' });
        const result = inviteService.redeemInvite(
            invite.code,
            telegramUser(4, { first_name: 'Ichiro', last_name: 'Suzuki' })
        );
        expect(result.user.name).toBe('Ichiro Suzuki');
    });

    it('appends a suffix when the derived name collides with an existing user', () => {
        userService.registerUser('Collide', 'collide_existing', TELEGRAM_BASE + 50, SYSTEM_USER_ID);

        const invite = createInvite({ type: 'REGISTRATION_ONLY' });
        const result = inviteService.redeemInvite(invite.code, telegramUser(5, { first_name: 'Collide' }));

        expect(result.user.name).not.toBe('Collide');
        expect(result.user.name.startsWith('Collide ')).toBe(true);
    });

    it('throws when a new user has no name to derive', () => {
        const invite = createInvite({ type: 'REGISTRATION_ONLY' });
        expect(() => inviteService.redeemInvite(invite.code, telegramUser(6)))
            .toThrow(NameRequiredForNewUserError);
    });

    it('throws for an unknown code', () => {
        expect(() => inviteService.redeemInvite('UNKNOWN000', telegramUser(7, { first_name: 'X' })))
            .toThrow(InviteNotFoundError);
    });

    it('throws when the invite is revoked', () => {
        const invite = createInvite();
        inviteService.revokeInvite(invite.id, SYSTEM_USER_ID);
        expect(() => inviteService.redeemInvite(invite.code, telegramUser(8, { first_name: 'X' })))
            .toThrow(InviteRevokedError);
    });

    it('throws when the invite is expired', () => {
        const invite = createInvite({ expiresAt: new Date('2020-01-01T00:00:00.000Z') });
        expect(() => inviteService.redeemInvite(invite.code, telegramUser(9, { first_name: 'X' })))
            .toThrow(InviteExpiredError);
    });

    it('throws when the invite has reached its max uses', () => {
        const invite = createInvite({ type: 'REGISTRATION_ONLY', maxUses: 1 });
        inviteService.redeemInvite(invite.code, telegramUser(10, { first_name: 'First' }));
        expect(() => inviteService.redeemInvite(invite.code, telegramUser(11, { first_name: 'Second' })))
            .toThrow(InviteExhaustedError);
    });
});
