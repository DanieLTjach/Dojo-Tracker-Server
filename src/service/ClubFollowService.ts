import type { Club } from '../model/ClubModels.ts';
import { ClubFollowRepository } from '../repository/ClubFollowRepository.ts';
import { ClubMembershipRepository } from '../repository/ClubMembershipRepository.ts';
import { ClubRepository } from '../repository/ClubRepository.ts';
import { ClubService } from './ClubService.ts';

export class ClubFollowService {
    private followRepository: ClubFollowRepository = new ClubFollowRepository();
    private membershipRepository: ClubMembershipRepository = new ClubMembershipRepository();
    private clubRepository: ClubRepository = new ClubRepository();
    private clubService: ClubService = new ClubService();

    followClub(clubId: number, userId: number): void {
        this.clubService.validateClubExists(clubId);
        this.followRepository.createFollow({ clubId, userId, modifiedBy: userId });
    }

    unfollowClub(clubId: number, userId: number): void {
        this.followRepository.deleteFollow(clubId, userId);
    }

    /**
     * Clubs shown in the top selector: the union of clubs the user explicitly
     * follows and clubs where the user is an active member. Active clubs only,
     * deduped by id and ordered by id.
     */
    getFollowedClubsForUser(userId: number): Club[] {
        const clubsById = new Map<number, Club>();

        for (const club of this.followRepository.findFollowedClubsByUserId(userId)) {
            clubsById.set(club.id, club);
        }

        for (const membership of this.membershipRepository.findActiveMembershipsByUserId(userId)) {
            if (clubsById.has(membership.clubId)) {
                continue;
            }
            const club = this.clubRepository.findClubById(membership.clubId);
            if (club && club.isActive) {
                clubsById.set(club.id, club);
            }
        }

        return Array.from(clubsById.values()).sort((a, b) => a.id - b.id);
    }
}
