import { ClubInviteRepository } from '../src/repository/ClubInviteRepository.ts';
import { ClubRepository } from '../src/repository/ClubRepository.ts';
import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';

const SYSTEM_USER_ID = 0;
const TEST_USER_ID = 93001;

function seedTestUser(): void {
    const timestamp = new Date().toISOString();
    dbManager.db.prepare(`
        INSERT INTO user (id, name, telegramUsername, telegramId, createdAt, modifiedAt, modifiedBy, isActive, isAdmin, status)
        VALUES (:id, :name, :telegramUsername, :telegramId, :createdAt, :modifiedAt, :modifiedBy, :isActive, :isAdmin, :status)
    `).run({
        id: TEST_USER_ID,
        name: 'Invite Repo User',
        telegramUsername: '@invite_repo_user',
        telegramId: 930010001,
        createdAt: timestamp,
        modifiedAt: timestamp,
        modifiedBy: SYSTEM_USER_ID,
        isActive: 1,
        isAdmin: 0,
        status: 'ACTIVE'
    });
}

describe('ClubInviteRepository', () => {
    const inviteRepository = new ClubInviteRepository();
    const clubRepository = new ClubRepository();
    let clubId: number;

    beforeAll(() => {
        seedTestUser();
        clubId = clubRepository.createClub({
            name: 'Invite Repo Club',
            address: null,
            city: null,
            description: null,
            contactInfo: null,
            isActive: true,
            createdAt: new Date('2026-04-01T10:00:00.000Z'),
            modifiedBy: SYSTEM_USER_ID
        });
    });

    afterEach(() => {
        dbManager.db.prepare('DELETE FROM clubInviteRedemption WHERE inviteId IN (SELECT id FROM clubInvite WHERE clubId = ?)').run(clubId);
        dbManager.db.prepare('DELETE FROM clubInvite WHERE clubId = ?').run(clubId);
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(clubId);
        dbManager.db.prepare('DELETE FROM user WHERE id = ?').run(TEST_USER_ID);
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    function createInvite(overrides: Partial<Parameters<ClubInviteRepository['createInvite']>[0]> = {}): number {
        const now = new Date('2026-04-02T10:00:00.000Z');
        return inviteRepository.createInvite({
            clubId,
            code: 'CODE12345A',
            type: 'AUTO_APPROVE',
            source: 'FESTIVAL',
            label: 'Spring booth',
            maxUses: 5,
            expiresAt: new Date('2026-05-01T00:00:00.000Z'),
            isActive: true,
            createdAt: now,
            modifiedAt: now,
            modifiedBy: SYSTEM_USER_ID,
            ...overrides
        });
    }

    it('creates an invite and maps it back with enums, dates and booleans', () => {
        const id = createInvite();
        const invite = inviteRepository.findById(id);

        expect(invite).toBeDefined();
        expect(invite).toMatchObject({
            id,
            clubId,
            clubName: 'Invite Repo Club',
            code: 'CODE12345A',
            type: 'AUTO_APPROVE',
            source: 'FESTIVAL',
            label: 'Spring booth',
            maxUses: 5,
            usesCount: 0,
            isActive: true
        });
        expect(invite!.expiresAt).toEqual(new Date('2026-05-01T00:00:00.000Z'));
        expect(invite!.createdAt).toEqual(new Date('2026-04-02T10:00:00.000Z'));
    });

    it('finds an invite by code and reports existence', () => {
        createInvite({ code: 'FINDME0001' });
        expect(inviteRepository.findByCode('FINDME0001')?.code).toBe('FINDME0001');
        expect(inviteRepository.existsByCode('FINDME0001')).toBe(true);
        expect(inviteRepository.findByCode('NOPECODE00')).toBeUndefined();
        expect(inviteRepository.existsByCode('NOPECODE00')).toBe(false);
    });

    it('lists invites for a club ordered by createdAt descending', () => {
        createInvite({ code: 'OLDCODE001', createdAt: new Date('2026-04-01T00:00:00.000Z') });
        createInvite({ code: 'NEWCODE001', createdAt: new Date('2026-04-05T00:00:00.000Z') });

        const codes = inviteRepository.findByClubId(clubId).map(invite => invite.code);
        expect(codes).toEqual(['NEWCODE001', 'OLDCODE001']);
    });

    it('deactivates an invite via setActive', () => {
        const id = createInvite();
        inviteRepository.setActive(id, false, SYSTEM_USER_ID);
        expect(inviteRepository.findById(id)!.isActive).toBe(false);
    });

    it('increments uses count', () => {
        const id = createInvite();
        inviteRepository.incrementUses(id);
        inviteRepository.incrementUses(id);
        expect(inviteRepository.findById(id)!.usesCount).toBe(2);
    });

    it('records and finds redemptions', () => {
        const id = createInvite();
        expect(inviteRepository.findRedemption(id, TEST_USER_ID)).toBe(false);

        inviteRepository.recordRedemption(id, TEST_USER_ID, new Date('2026-04-10T00:00:00.000Z'));
        expect(inviteRepository.findRedemption(id, TEST_USER_ID)).toBe(true);
    });
});
