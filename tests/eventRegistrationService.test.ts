import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { EventRegistrationService } from '../src/service/EventRegistrationService.ts';
import { EventRegistrationRepository } from '../src/repository/EventRegistrationRepository.ts';
import { ClubMembershipRepository } from '../src/repository/ClubMembershipRepository.ts';
import { ProfileRepository } from '../src/repository/ProfileRepository.ts';
import {
    EventCapacityReachedError,
    EventRegistrationNotFoundError,
    InvalidEventRegistrationStateError,
    MissingProfileNamesForTournamentRegistrationError,
} from '../src/error/EventRegistrationErrors.ts';
import { BadRequestError } from '../src/error/BaseErrors.ts';

const SYSTEM_USER_ID = 0;

describe('EventRegistrationService', () => {
    const service = new EventRegistrationService();
    const registrationRepo = new EventRegistrationRepository();
    const membershipRepo = new ClubMembershipRepository();
    const profileRepo = new ProfileRepository();

    const TEST_CLUB_ID = 96100;
    const OWNER_USER_ID = 96201;
    const NON_MEMBER_USER_ID = 96202;
    const EXISTING_MEMBER_USER_ID = 96203;
    const NO_NAMES_USER_ID = 96204;
    const REJECTED_USER_ID = 96205;
    const APPROVED_USER_ID = 96206;
    const CAPACITY_USER_A = 96207;
    const CAPACITY_USER_B = 96208;
    const SEASON_USER_ID = 96209;

    const TOURNAMENT_EVENT_ID = 96300;
    const TOURNAMENT_LIMITED_EVENT_ID = 96301;
    const SEASON_EVENT_ID = 96302;
    const TOURNAMENT_NICKNAME_EVENT_ID = 96303;
    const GAME_RULES_ID = 96400;

    let timestampOffset = 0;
    function nextTs(): string {
        timestampOffset += 1;
        return new Date(Date.parse('2026-04-01T00:00:00.000Z') + timestampOffset).toISOString();
    }

    function insertUser(userId: number, name: string): void {
        const ts = nextTs();
        dbManager.db.prepare(
            `INSERT INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, NULL, NULL, 0, 1, 'ACTIVE', ?, ?, ?)`
        ).run(userId, name, ts, ts, SYSTEM_USER_ID);
    }

    function setProfileNames(userId: number, firstName: string | null, lastName: string | null): void {
        profileRepo.upsertProfile(userId, null, null, firstName, lastName, null, false, SYSTEM_USER_ID);
    }

    function insertMembership(
        clubId: number,
        userId: number,
        status: 'ACTIVE' | 'PENDING' | 'INACTIVE',
        role: 'OWNER' | 'MODERATOR' | 'MEMBER' = 'MEMBER'
    ): void {
        const ts = nextTs();
        dbManager.db.prepare(
            `INSERT INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(clubId, userId) DO UPDATE SET role = excluded.role, status = excluded.status, modifiedAt = excluded.modifiedAt, modifiedBy = excluded.modifiedBy`
        ).run(clubId, userId, role, status, ts, ts, SYSTEM_USER_ID);
    }

    beforeAll(() => {
        // Users
        insertUser(OWNER_USER_ID, 'ERS Owner');
        insertUser(NON_MEMBER_USER_ID, 'ERS NonMember');
        insertUser(EXISTING_MEMBER_USER_ID, 'ERS Member');
        insertUser(NO_NAMES_USER_ID, 'ERS NoNames');
        insertUser(REJECTED_USER_ID, 'ERS Rejected');
        insertUser(APPROVED_USER_ID, 'ERS Approved');
        insertUser(CAPACITY_USER_A, 'ERS CapacityA');
        insertUser(CAPACITY_USER_B, 'ERS CapacityB');
        insertUser(SEASON_USER_ID, 'ERS SeasonUser');

        // Profiles with firstName/lastName for everyone except NO_NAMES_USER_ID
        for (
            const id of [
                OWNER_USER_ID,
                NON_MEMBER_USER_ID,
                EXISTING_MEMBER_USER_ID,
                REJECTED_USER_ID,
                APPROVED_USER_ID,
                CAPACITY_USER_A,
                CAPACITY_USER_B,
                SEASON_USER_ID,
            ]
        ) {
            setProfileNames(id, 'First', 'Last');
        }

        // Club + memberships
        const ts = nextTs();
        dbManager.db.prepare(
            `INSERT INTO club (id, name, address, city, description, contactInfo, isActive, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'ERS Club', NULL, NULL, NULL, NULL, 1, ?, ?, ?)`
        ).run(TEST_CLUB_ID, ts, ts, SYSTEM_USER_ID);

        insertMembership(TEST_CLUB_ID, OWNER_USER_ID, 'ACTIVE', 'OWNER');
        insertMembership(TEST_CLUB_ID, EXISTING_MEMBER_USER_ID, 'ACTIVE', 'MEMBER');

        // Game rules + events
        dbManager.db.prepare(
            `INSERT INTO gameRules (id, name, numberOfPlayers, uma, startingPoints, clubId)
             VALUES (?, 'ERS Rules', 4, '[15,5,-5,-15]', 30000, ?)`
        ).run(GAME_RULES_ID, TEST_CLUB_ID);

        dbManager.db.prepare(
            `INSERT INTO event (id, name, description, type, gameRules, clubId, dateFrom, dateTo, startingRating, minimumGamesForRating, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'ERS Tournament', NULL, 'TOURNAMENT', ?, ?, NULL, NULL, 0, 0, ?, ?, ?)`
        ).run(TOURNAMENT_EVENT_ID, GAME_RULES_ID, TEST_CLUB_ID, nextTs(), nextTs(), SYSTEM_USER_ID);

        dbManager.db.prepare(
            `INSERT INTO event (id, name, description, type, gameRules, clubId, dateFrom, dateTo, startingRating, minimumGamesForRating, config, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'ERS Tournament Capacity', NULL, 'TOURNAMENT', ?, ?, NULL, NULL, 0, 0, '{"maxParticipants":1}', ?, ?, ?)`
        ).run(TOURNAMENT_LIMITED_EVENT_ID, GAME_RULES_ID, TEST_CLUB_ID, nextTs(), nextTs(), SYSTEM_USER_ID);

        dbManager.db.prepare(
            `INSERT INTO event (id, name, description, type, gameRules, clubId, dateFrom, dateTo, startingRating, minimumGamesForRating, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'ERS Season', NULL, 'SEASON', ?, ?, NULL, NULL, 0, 0, ?, ?, ?)`
        ).run(SEASON_EVENT_ID, GAME_RULES_ID, TEST_CLUB_ID, nextTs(), nextTs(), SYSTEM_USER_ID);

        dbManager.db.prepare(
            `INSERT INTO event (id, name, description, type, gameRules, clubId, dateFrom, dateTo, startingRating, minimumGamesForRating, config, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'ERS Tournament Nickname', NULL, 'TOURNAMENT', ?, ?, NULL, NULL, 0, 0, '{"playerNameDisplay":"NICKNAME"}', ?, ?, ?)`
        ).run(TOURNAMENT_NICKNAME_EVENT_ID, GAME_RULES_ID, TEST_CLUB_ID, nextTs(), nextTs(), SYSTEM_USER_ID);
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM eventRegistration WHERE eventId IN (?, ?, ?, ?)').run(
            TOURNAMENT_EVENT_ID,
            TOURNAMENT_LIMITED_EVENT_ID,
            SEASON_EVENT_ID,
            TOURNAMENT_NICKNAME_EVENT_ID
        );
        dbManager.db.prepare('DELETE FROM event WHERE id IN (?, ?, ?, ?)').run(
            TOURNAMENT_EVENT_ID,
            TOURNAMENT_LIMITED_EVENT_ID,
            SEASON_EVENT_ID,
            TOURNAMENT_NICKNAME_EVENT_ID
        );
        dbManager.db.prepare('DELETE FROM gameRules WHERE id = ?').run(GAME_RULES_ID);
        dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ?').run(TEST_CLUB_ID);
        dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(TEST_CLUB_ID);
        dbManager.db.prepare('DELETE FROM profile WHERE userId IN (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
            OWNER_USER_ID,
            NON_MEMBER_USER_ID,
            EXISTING_MEMBER_USER_ID,
            NO_NAMES_USER_ID,
            REJECTED_USER_ID,
            APPROVED_USER_ID,
            CAPACITY_USER_A,
            CAPACITY_USER_B,
            SEASON_USER_ID
        );
        dbManager.db.prepare('DELETE FROM user WHERE id IN (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
            OWNER_USER_ID,
            NON_MEMBER_USER_ID,
            EXISTING_MEMBER_USER_ID,
            NO_NAMES_USER_ID,
            REJECTED_USER_ID,
            APPROVED_USER_ID,
            CAPACITY_USER_A,
            CAPACITY_USER_B,
            SEASON_USER_ID
        );
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    afterEach(() => {
        // Wipe registrations between tests for isolation
        dbManager.db.prepare('DELETE FROM eventRegistration WHERE eventId IN (?, ?, ?, ?)').run(
            TOURNAMENT_EVENT_ID,
            TOURNAMENT_LIMITED_EVENT_ID,
            SEASON_EVENT_ID,
            TOURNAMENT_NICKNAME_EVENT_ID
        );
        // Reset NON_MEMBER club membership for clean apply tests
        dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ? AND userId = ?').run(
            TEST_CLUB_ID,
            NON_MEMBER_USER_ID
        );
    });

    describe('apply', () => {
        it('creates PENDING registration and PENDING clubMembership for non-member', () => {
            const result = service.apply(TOURNAMENT_EVENT_ID, NON_MEMBER_USER_ID);
            expect(result.status).toBe('PENDING');
            const membership = membershipRepo.findMembership(TEST_CLUB_ID, NON_MEMBER_USER_ID);
            expect(membership?.status).toBe('PENDING');
        });

        it('does not change ACTIVE clubMembership when an existing member applies', () => {
            const before = membershipRepo.findMembership(TEST_CLUB_ID, EXISTING_MEMBER_USER_ID);
            const result = service.apply(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID);
            expect(result.status).toBe('PENDING');
            const after = membershipRepo.findMembership(TEST_CLUB_ID, EXISTING_MEMBER_USER_ID);
            expect(after?.status).toBe(before?.status);
            expect(after?.status).toBe('ACTIVE');
        });

        it('is idempotent for an existing PENDING registration', () => {
            const first = service.apply(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID);
            const second = service.apply(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID);
            expect(first.status).toBe('PENDING');
            expect(second.status).toBe('PENDING');
            const all = registrationRepo.findRegistrationsByEventId(TOURNAMENT_EVENT_ID);
            expect(all.filter(r => r.userId === EXISTING_MEMBER_USER_ID)).toHaveLength(1);
        });

        it('is idempotent for an existing APPROVED registration', () => {
            service.apply(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID);
            service.approve(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID, OWNER_USER_ID);
            const result = service.apply(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID);
            expect(result.status).toBe('APPROVED');
        });

        it('flips REJECTED back to PENDING', () => {
            service.apply(TOURNAMENT_EVENT_ID, REJECTED_USER_ID);
            service.reject(TOURNAMENT_EVENT_ID, REJECTED_USER_ID, OWNER_USER_ID);
            expect(registrationRepo.findRegistration(TOURNAMENT_EVENT_ID, REJECTED_USER_ID)?.status).toBe('REJECTED');

            const result = service.apply(TOURNAMENT_EVENT_ID, REJECTED_USER_ID);
            expect(result.status).toBe('PENDING');
        });

        it('throws MissingProfileNamesForTournamentRegistrationError when profile lacks firstName/lastName', () => {
            expect(() => service.apply(TOURNAMENT_EVENT_ID, NO_NAMES_USER_ID)).toThrow(
                MissingProfileNamesForTournamentRegistrationError
            );
        });

        it('allows apply without firstName/lastName when event resolves to NICKNAME display', () => {
            const result = service.apply(TOURNAMENT_NICKNAME_EVENT_ID, NO_NAMES_USER_ID);
            expect(result.status).toBe('PENDING');
        });

        it('rejects apply on non-tournament events', () => {
            expect(() => service.apply(SEASON_EVENT_ID, EXISTING_MEMBER_USER_ID)).toThrow(BadRequestError);
        });
    });

    describe('approve', () => {
        beforeEach(() => {
            service.apply(TOURNAMENT_EVENT_ID, NON_MEMBER_USER_ID);
        });

        it('approves PENDING registration and activates PENDING clubMembership atomically', () => {
            const before = membershipRepo.findMembership(TEST_CLUB_ID, NON_MEMBER_USER_ID);
            expect(before?.status).toBe('PENDING');

            const result = service.approve(TOURNAMENT_EVENT_ID, NON_MEMBER_USER_ID, OWNER_USER_ID);
            expect(result.status).toBe('APPROVED');

            const after = membershipRepo.findMembership(TEST_CLUB_ID, NON_MEMBER_USER_ID);
            expect(after?.status).toBe('ACTIVE');
        });

        it('approves REJECTED registration and activates PENDING clubMembership atomically', () => {
            service.reject(TOURNAMENT_EVENT_ID, NON_MEMBER_USER_ID, OWNER_USER_ID);
            expect(registrationRepo.findRegistration(TOURNAMENT_EVENT_ID, NON_MEMBER_USER_ID)?.status)
                .toBe('REJECTED');
            expect(membershipRepo.findMembership(TEST_CLUB_ID, NON_MEMBER_USER_ID)?.status).toBe('PENDING');

            const result = service.approve(TOURNAMENT_EVENT_ID, NON_MEMBER_USER_ID, OWNER_USER_ID);
            expect(result.status).toBe('APPROVED');
            expect(membershipRepo.findMembership(TEST_CLUB_ID, NON_MEMBER_USER_ID)?.status).toBe('ACTIVE');
        });

        it('throws when registration is already APPROVED', () => {
            service.approve(TOURNAMENT_EVENT_ID, NON_MEMBER_USER_ID, OWNER_USER_ID);
            expect(() => service.approve(TOURNAMENT_EVENT_ID, NON_MEMBER_USER_ID, OWNER_USER_ID))
                .toThrow(InvalidEventRegistrationStateError);
        });

        it('throws when registration does not exist', () => {
            expect(() => service.approve(TOURNAMENT_EVENT_ID, APPROVED_USER_ID, OWNER_USER_ID))
                .toThrow(EventRegistrationNotFoundError);
        });

        it('returns 409 EventCapacityReachedError when maxParticipants reached', () => {
            service.apply(TOURNAMENT_LIMITED_EVENT_ID, CAPACITY_USER_A);
            service.apply(TOURNAMENT_LIMITED_EVENT_ID, CAPACITY_USER_B);
            service.approve(TOURNAMENT_LIMITED_EVENT_ID, CAPACITY_USER_A, OWNER_USER_ID);

            expect(() => service.approve(TOURNAMENT_LIMITED_EVENT_ID, CAPACITY_USER_B, OWNER_USER_ID))
                .toThrow(EventCapacityReachedError);
        });

        it('frees up a capacity slot when an APPROVED participant is rejected', () => {
            service.apply(TOURNAMENT_LIMITED_EVENT_ID, CAPACITY_USER_A);
            service.apply(TOURNAMENT_LIMITED_EVENT_ID, CAPACITY_USER_B);
            service.approve(TOURNAMENT_LIMITED_EVENT_ID, CAPACITY_USER_A, OWNER_USER_ID);
            service.reject(TOURNAMENT_LIMITED_EVENT_ID, CAPACITY_USER_A, OWNER_USER_ID);

            const reapproved = service.approve(TOURNAMENT_LIMITED_EVENT_ID, CAPACITY_USER_B, OWNER_USER_ID);
            expect(reapproved.status).toBe('APPROVED');
        });
    });

    describe('reject', () => {
        it('moves PENDING → REJECTED without touching club membership', () => {
            service.apply(TOURNAMENT_EVENT_ID, NON_MEMBER_USER_ID);
            const membershipBefore = membershipRepo.findMembership(TEST_CLUB_ID, NON_MEMBER_USER_ID);

            const result = service.reject(TOURNAMENT_EVENT_ID, NON_MEMBER_USER_ID, OWNER_USER_ID);
            expect(result.status).toBe('REJECTED');

            const membershipAfter = membershipRepo.findMembership(TEST_CLUB_ID, NON_MEMBER_USER_ID);
            expect(membershipAfter?.status).toBe(membershipBefore?.status);
        });

        it('moves APPROVED → REJECTED without touching club membership', () => {
            service.apply(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID);
            service.approve(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID, OWNER_USER_ID);
            const before = membershipRepo.findMembership(TEST_CLUB_ID, EXISTING_MEMBER_USER_ID);
            expect(before?.status).toBe('ACTIVE');

            const result = service.reject(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID, OWNER_USER_ID);
            expect(result.status).toBe('REJECTED');

            const after = membershipRepo.findMembership(TEST_CLUB_ID, EXISTING_MEMBER_USER_ID);
            expect(after?.status).toBe('ACTIVE');
        });
    });

    describe('withdraw', () => {
        it('deletes PENDING registration and lets user re-apply afterwards', () => {
            service.apply(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID);
            service.withdraw(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID);
            expect(registrationRepo.findRegistration(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID)).toBeUndefined();

            const reapplied = service.apply(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID);
            expect(reapplied.status).toBe('PENDING');
        });

        it('refuses to withdraw when no registration exists', () => {
            expect(() => service.withdraw(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID))
                .toThrow(EventRegistrationNotFoundError);
        });

        it('refuses to withdraw a REJECTED registration', () => {
            service.apply(TOURNAMENT_EVENT_ID, REJECTED_USER_ID);
            service.reject(TOURNAMENT_EVENT_ID, REJECTED_USER_ID, OWNER_USER_ID);
            expect(() => service.withdraw(TOURNAMENT_EVENT_ID, REJECTED_USER_ID))
                .toThrow(InvalidEventRegistrationStateError);
        });
    });

    describe('manualRegister', () => {
        it('creates APPROVED registration and ACTIVE clubMembership for non-member in one call', () => {
            const result = service.manualRegister(TOURNAMENT_EVENT_ID, NON_MEMBER_USER_ID, OWNER_USER_ID);
            expect(result.status).toBe('APPROVED');
            const membership = membershipRepo.findMembership(TEST_CLUB_ID, NON_MEMBER_USER_ID);
            expect(membership?.status).toBe('ACTIVE');
        });

        it('throws MissingProfileNamesForTournamentRegistrationError when profile lacks names', () => {
            expect(() => service.manualRegister(TOURNAMENT_EVENT_ID, NO_NAMES_USER_ID, OWNER_USER_ID))
                .toThrow(MissingProfileNamesForTournamentRegistrationError);
        });

        it('sets profile names supplied in profileNames before the names check', () => {
            const result = service.manualRegister(
                TOURNAMENT_EVENT_ID,
                NO_NAMES_USER_ID,
                OWNER_USER_ID,
                { firstName: 'Гема', lastName: 'Власова' }
            );
            expect(result.status).toBe('APPROVED');
            const profile = profileRepo.findProfileByUserId(NO_NAMES_USER_ID);
            expect(profile?.firstName).toBe('Гема');
            expect(profile?.lastName).toBe('Власова');
        });

        it('respects maxParticipants', () => {
            service.manualRegister(TOURNAMENT_LIMITED_EVENT_ID, CAPACITY_USER_A, OWNER_USER_ID);
            expect(() => service.manualRegister(TOURNAMENT_LIMITED_EVENT_ID, CAPACITY_USER_B, OWNER_USER_ID))
                .toThrow(EventCapacityReachedError);
        });

        it('sets isFillerPlayer when provided', () => {
            const result = service.manualRegister(
                TOURNAMENT_EVENT_ID,
                NON_MEMBER_USER_ID,
                OWNER_USER_ID,
                undefined,
                true
            );
            expect(result.isFillerPlayer).toBe(true);
        });

        it('defaults isFillerPlayer to false when omitted', () => {
            const result = service.manualRegister(TOURNAMENT_EVENT_ID, APPROVED_USER_ID, OWNER_USER_ID);
            expect(result.isFillerPlayer).toBe(false);
        });
    });

    describe('setFillerPlayer', () => {
        beforeEach(() => {
            service.apply(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID);
            service.approve(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID, OWNER_USER_ID);
        });

        it('sets isFillerPlayer to true', () => {
            const result = service.setFillerPlayer(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID, true, OWNER_USER_ID);
            expect(result.isFillerPlayer).toBe(true);
            const stored = registrationRepo.findRegistration(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID);
            expect(stored?.isFillerPlayer).toBe(true);
        });

        it('sets isFillerPlayer back to false', () => {
            service.setFillerPlayer(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID, true, OWNER_USER_ID);
            const result = service.setFillerPlayer(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID, false, OWNER_USER_ID);
            expect(result.isFillerPlayer).toBe(false);
        });

        it('defaults isFillerPlayer to false on new registrations', () => {
            service.apply(TOURNAMENT_EVENT_ID, NON_MEMBER_USER_ID);
            const registration = registrationRepo.findRegistration(TOURNAMENT_EVENT_ID, NON_MEMBER_USER_ID);
            expect(registration?.isFillerPlayer).toBe(false);
        });

        it('refuses to update filler flag for a non-registered user', () => {
            expect(() => service.setFillerPlayer(TOURNAMENT_EVENT_ID, APPROVED_USER_ID, true, OWNER_USER_ID))
                .toThrow(EventRegistrationNotFoundError);
        });
    });

    describe('editParticipantProfileNames', () => {
        beforeEach(() => {
            setProfileNames(EXISTING_MEMBER_USER_ID, 'First', 'Last');
            service.apply(TOURNAMENT_EVENT_ID, EXISTING_MEMBER_USER_ID);
        });

        it('updates only firstName/lastName, leaves other profile fields untouched', () => {
            // Set EMA fields on the participant first
            profileRepo.upsertProfile(
                EXISTING_MEMBER_USER_ID,
                'EmaFirst',
                'EmaLast',
                'First',
                'Last',
                '12345',
                false,
                SYSTEM_USER_ID
            );

            service.editParticipantProfileNames(
                TOURNAMENT_EVENT_ID,
                EXISTING_MEMBER_USER_ID,
                'Новий',
                'Прізвище',
                OWNER_USER_ID
            );

            const profile = profileRepo.findProfileByUserId(EXISTING_MEMBER_USER_ID);
            expect(profile?.firstName).toBe('Новий');
            expect(profile?.lastName).toBe('Прізвище');
            expect(profile?.firstNameEn).toBe('EmaFirst');
            expect(profile?.lastNameEn).toBe('EmaLast');
            expect(profile?.emaNumber).toBe('12345');
        });

        it('refuses to edit profile of a non-registered user', () => {
            expect(() =>
                service.editParticipantProfileNames(TOURNAMENT_EVENT_ID, APPROVED_USER_ID, 'X', 'Y', OWNER_USER_ID)
            )
                .toThrow(EventRegistrationNotFoundError);
        });
    });
});
