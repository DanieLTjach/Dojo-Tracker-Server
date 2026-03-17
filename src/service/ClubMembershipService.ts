import {
    ClubMembershipAlreadyExistsError,
    ClubMembershipNotFoundError,
    ClubNotFoundError,
    InvalidClubMembershipStateError
} from '../error/ClubErrors.ts';
import type { ClubMembership, ClubRole } from '../model/ClubModels.ts';
import { ClubRepository } from '../repository/ClubRepository.ts';
import { ClubMembershipRepository } from '../repository/ClubMembershipRepository.ts';
import { UserService } from './UserService.ts';

export class ClubMembershipService {
    private clubRepository: ClubRepository = new ClubRepository();
    private membershipRepository: ClubMembershipRepository = new ClubMembershipRepository();
    private userService: UserService = new UserService();

    getMembers(clubId: number): ClubMembership[] {
        this.validateClubExists(clubId);
        return this.membershipRepository.findMembersByClubId(clubId);
    }

    getActiveMembersByClubId(clubId: number): ClubMembership[] {
        this.validateClubExists(clubId);
        return this.membershipRepository.findActiveMembersByClubId(clubId);
    }

    getPendingMembers(clubId: number): ClubMembership[] {
        this.validateClubExists(clubId);
        return this.membershipRepository.findPendingMembersByClubId(clubId);
    }

    requestJoin(clubId: number, userId: number, modifiedBy: number): ClubMembership {
        const clubName = this.validateClubExists(clubId);
        this.userService.validateUserExistsById(userId);

        const existingMembership = this.membershipRepository.findMembership(clubId, userId);
        if (existingMembership) {
            if (existingMembership.status === 'PENDING') {
                return existingMembership;
            }
            if (existingMembership.status === 'ACTIVE') {
                throw new ClubMembershipAlreadyExistsError(clubName, userId);
            }
            // INACTIVE — user wants to re-join, update status back to PENDING
            this.membershipRepository.updateMembershipStatus(clubId, userId, 'PENDING', modifiedBy);
            return this.getMembership(clubId, userId);
        }

        const now = new Date();
        this.membershipRepository.createMembership({
            clubId,
            userId,
            role: 'MEMBER',
            status: 'PENDING',
            createdAt: now,
            modifiedAt: now,
            modifiedBy
        });

        return this.getMembership(clubId, userId);
    }

    leaveClub(clubId: number, userId: number): ClubMembership {
        this.validateClubExists(clubId);
        this.validateMembershipExists(clubId, userId);

        this.membershipRepository.updateMembershipStatus(clubId, userId, 'INACTIVE', userId);
        return this.getMembership(clubId, userId);
    }

    activateMember(clubId: number, userId: number, modifiedBy: number): ClubMembership {
        this.validateClubExists(clubId);

        const membership = this.getMembership(clubId, userId);
        if (membership.status !== 'PENDING') {
            throw new InvalidClubMembershipStateError('активувати', membership.status, ['PENDING']);
        }

        this.membershipRepository.updateMembershipStatus(clubId, userId, 'ACTIVE', modifiedBy);
        return this.getMembership(clubId, userId);
    }

    deactivateMember(clubId: number, userId: number, modifiedBy: number): ClubMembership {
        this.validateClubExists(clubId);
        this.validateMembershipExists(clubId, userId);

        this.membershipRepository.updateMembershipStatus(clubId, userId, 'INACTIVE', modifiedBy);
        return this.getMembership(clubId, userId);
    }

    updateMemberRole(clubId: number, userId: number, role: ClubRole, modifiedBy: number): ClubMembership {
        this.validateClubExists(clubId);

        const membership = this.getMembership(clubId, userId);
        if (membership.status !== 'ACTIVE') {
            throw new InvalidClubMembershipStateError('змінити роль', membership.status, ['ACTIVE']);
        }

        this.membershipRepository.updateMembershipRole(clubId, userId, role, modifiedBy);
        return this.getMembership(clubId, userId);
    }

    private validateClubExists(clubId: number): string {
        const club = this.clubRepository.findClubById(clubId);
        if (!club) {
            throw new ClubNotFoundError(String(clubId));
        }
        return club.name;
    }

    private validateMembershipExists(clubId: number, userId: number): void {
        this.getMembership(clubId, userId);
    }

    private getMembership(clubId: number, userId: number): ClubMembership {
        const membership = this.membershipRepository.findMembership(clubId, userId);
        if (!membership) {
            const club = this.clubRepository.findClubById(clubId);
            throw new ClubMembershipNotFoundError(club?.name ?? String(clubId), userId);
        }
        return membership;
    }
}
