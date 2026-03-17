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

    getPendingMembers(clubId: number): ClubMembership[] {
        this.validateClubExists(clubId);
        return this.membershipRepository.findPendingMembersByClubId(clubId);
    }

    requestJoin(clubId: number, userId: number, modifiedBy: number): ClubMembership {
        this.validateClubExists(clubId);
        this.userService.validateUserExistsById(userId);

        const existingMembership = this.membershipRepository.findMembership(clubId, userId);
        if (existingMembership) {
            throw new ClubMembershipAlreadyExistsError(clubId, userId);
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
        this.getMembership(clubId, userId);

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

    private validateClubExists(clubId: number): void {
        if (!this.clubRepository.clubExists(clubId)) {
            throw new ClubNotFoundError(clubId);
        }
    }

    private getMembership(clubId: number, userId: number): ClubMembership {
        const membership = this.membershipRepository.findMembership(clubId, userId);
        if (!membership) {
            throw new ClubMembershipNotFoundError(clubId, userId);
        }
        return membership;
    }
}
