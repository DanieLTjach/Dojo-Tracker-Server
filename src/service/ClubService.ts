import { ClubNameAlreadyExistsError, ClubNotFoundError } from '../error/ClubErrors.ts';
import type { Club } from '../model/ClubModels.ts';
import { ClubRepository } from '../repository/ClubRepository.ts';

export class ClubService {
    private clubRepository: ClubRepository = new ClubRepository();

    getAllClubs(): Club[] {
        return this.clubRepository.findAllClubs();
    }

    getClubById(clubId: number): Club {
        const club = this.clubRepository.findClubById(clubId);
        if (!club) {
            throw new ClubNotFoundError(String(clubId));
        }
        return club;
    }

    createClub(data: ClubData, modifiedBy: number): Club {
        const existingClub = this.clubRepository.findClubByName(data.name);
        if (existingClub) {
            throw new ClubNameAlreadyExistsError(data.name);
        }

        const now = new Date();
        const clubId = this.clubRepository.createClub({
            name: data.name,
            address: data.address ?? null,
            city: data.city ?? null,
            description: data.description ?? null,
            contactInfo: data.contactInfo ?? null,
            isActive: data.isActive ?? true,
            ratingChatId: data.ratingChatId ?? null,
            ratingTopicId: data.ratingTopicId ?? null,
            createdAt: now,
            modifiedBy
        });

        return this.getClubById(clubId);
    }

    updateClub(clubId: number, data: ClubData, modifiedBy: number): Club {
        this.getClubById(clubId);

        const existingClub = this.clubRepository.findClubByName(data.name);
        if (existingClub && existingClub.id !== clubId) {
            throw new ClubNameAlreadyExistsError(data.name);
        }

        const now = new Date();
        this.clubRepository.updateClub({
            id: clubId,
            name: data.name,
            address: data.address ?? null,
            city: data.city ?? null,
            description: data.description ?? null,
            contactInfo: data.contactInfo ?? null,
            isActive: data.isActive ?? true,
            ratingChatId: data.ratingChatId ?? null,
            ratingTopicId: data.ratingTopicId ?? null,
            modifiedAt: now,
            modifiedBy
        });

        return this.getClubById(clubId);
    }

    deleteClub(clubId: number): void {
        this.getClubById(clubId);
        this.clubRepository.deleteClub(clubId);
    }
}

export interface ClubData {
    name: string;
    address?: string | null | undefined;
    city?: string | null | undefined;
    description?: string | null | undefined;
    contactInfo?: string | null | undefined;
    isActive?: boolean | null | undefined;
    ratingChatId?: string | null | undefined;
    ratingTopicId?: string | null | undefined;
}
