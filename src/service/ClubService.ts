import { ClubNameAlreadyExistsError, ClubNotFoundError } from '../error/ClubErrors.ts';
import type { Club, ClubTelegramTopics } from '../model/ClubModels.ts';
import { ClubTelegramTopicType } from '../model/TelegramTopic.ts';
import type { TelegramTopic } from '../model/TelegramTopic.ts';
import { ClubRepository } from '../repository/ClubRepository.ts';

export class ClubService {
    private clubRepository: ClubRepository = new ClubRepository();

    getAllClubs(): Club[] {
        return this.clubRepository.findAllClubs();
    }

    getAllActiveClubs(): Club[] {
        return this.getAllClubs().filter(club => club.isActive);
    }

    getClubById(clubId: number): Club {
        const club = this.clubRepository.findClubById(clubId);
        if (!club) {
            throw new ClubNotFoundError(clubId);
        }
        return club;
    }

    validateClubExists(clubId: number): void {
        this.getClubById(clubId);
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
            modifiedAt: now,
            modifiedBy
        });

        return this.getClubById(clubId);
    }

    deleteClub(clubId: number): void {
        this.getClubById(clubId);
        this.clubRepository.updateClubStatus(clubId, false);
    }

    getClubTelegramTopics(clubId: number): ClubTelegramTopics {
        return this.clubRepository.getClubTelegramTopics(clubId) ?? {
            rating: null,
            userLogs: null,
            gameLogs: null
        };
    }

    setClubTelegramTopics(clubId: number, topics: ClubTelegramTopics, modifiedBy: number) {
        return this.clubRepository.setClubTelegramTopics(clubId, topics, new Date(), modifiedBy);
    }
}

export function updateClubTelegramTopic(
    topics: ClubTelegramTopics,
    topicType: ClubTelegramTopicType,
    chatId: number,
    topicId: number | undefined
): ClubTelegramTopics {
    const telegramTopic: TelegramTopic = { type: topicType, chatId, topicId };

    switch (topicType) {
        case ClubTelegramTopicType.RATING:
            return { ...topics, rating: telegramTopic };
        case ClubTelegramTopicType.USER_LOGS:
            return { ...topics, userLogs: telegramTopic };
        case ClubTelegramTopicType.GAME_LOGS:
            return { ...topics, gameLogs: telegramTopic };
    }
}

export interface ClubData {
    name: string;
    address?: string | null | undefined;
    city?: string | null | undefined;
    description?: string | null | undefined;
    contactInfo?: string | null | undefined;
    isActive?: boolean | null | undefined;
}
