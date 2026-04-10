import { ClubNameAlreadyExistsError, ClubNotFoundError } from '../error/ClubErrors.ts';
import type { Club, ClubTelegramTopics } from '../model/ClubModels.ts';
import { ClubTelegramTopicType, globalClubLogsTopic } from '../model/TelegramTopic.ts';
import type { TelegramTopic } from '../model/TelegramTopic.ts';
import { ClubRepository } from '../repository/ClubRepository.ts';
import LogService from './LogService.ts';
import dedent from 'dedent';
import { UserRepository } from '../repository/UserRepository.ts';

export class ClubService {
    private clubRepository: ClubRepository = new ClubRepository();
    private userRepository: UserRepository = new UserRepository();

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

        const newClub = this.getClubById(clubId);
        this.logCreatedClub(newClub, modifiedBy);
        return newClub;
    }

    updateClub(clubId: number, data: ClubData, modifiedBy: number): Club {
        const oldClub = this.getClubById(clubId);

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

        const newClub = this.getClubById(clubId);
        this.logEditedClub(oldClub, newClub, modifiedBy);
        return newClub;
    }

    deleteClub(clubId: number, deletedBy: number): void {
        const club = this.getClubById(clubId);
        this.clubRepository.updateClubStatus(clubId, false, deletedBy, new Date());
        this.logDeletedClub(club, deletedBy);
    }

    getClubTelegramTopics(clubId: number): ClubTelegramTopics {
        return this.clubRepository.getClubTelegramTopics(clubId) ?? {
            rating: null,
            userLogs: null,
            gameLogs: null,
            clubLogs: null
        };
    }

    setClubTelegramTopics(clubId: number, topics: ClubTelegramTopics, modifiedBy: number) {
        return this.clubRepository.setClubTelegramTopics(clubId, topics, new Date(), modifiedBy);
    }

    private logClubEvent(clubId: number, message: string): void {
        LogService.logInfo(message, globalClubLogsTopic);
        const clubLogsTopic = this.getClubTelegramTopics(clubId).clubLogs;
        if (clubLogsTopic !== null) {
            LogService.logInfo(message, clubLogsTopic);
        }
    }

    private logCreatedClub(club: Club, createdBy: number): void {
        const creator = this.userRepository.findUserById(createdBy);
        const message = dedent`
            <b>🏛️ New Club Created</b>

            <b>Club ID:</b> <code>${club.id}</code>
            <b>Name:</b> ${club.name}
            <b>City:</b> ${club.city || 'N/A'}
            <b>Address:</b> ${club.address || 'N/A'}
            <b>Description:</b> ${club.description || 'N/A'}
            <b>Contact Info:</b> ${club.contactInfo || 'N/A'}
            <b>Created by:</b> ${creator?.name} <code>(ID: ${creator?.id})</code>
        `;
        this.logClubEvent(club.id, message);
    }

    private logEditedClub(oldClub: Club, newClub: Club, modifiedBy: number): void {
        const modifier = this.userRepository.findUserById(modifiedBy);
        const changes: string[] = [];

        if (oldClub.name !== newClub.name) changes.push(`<b>Name:</b> ${oldClub.name} → ${newClub.name}`);
        if (oldClub.city !== newClub.city) changes.push(`<b>City:</b> ${oldClub.city || 'N/A'} → ${newClub.city || 'N/A'}`);
        if (oldClub.address !== newClub.address) changes.push(`<b>Address:</b> ${oldClub.address || 'N/A'} → ${newClub.address || 'N/A'}`);
        if (oldClub.description !== newClub.description) changes.push(`<b>Description:</b> ${oldClub.description || 'N/A'} → ${newClub.description || 'N/A'}`);
        if (oldClub.contactInfo !== newClub.contactInfo) changes.push(`<b>Contact Info:</b> ${oldClub.contactInfo || 'N/A'} → ${newClub.contactInfo || 'N/A'}`);
        if (oldClub.isActive !== newClub.isActive) changes.push(`<b>Is Active:</b> ${oldClub.isActive} → ${newClub.isActive}`);

        let message = dedent`
            <b>✏️ Club Edited</b>

            <b>Club ID:</b> <code>${newClub.id}</code>
            <b>Name:</b> ${newClub.name}
        `;
        if (changes.length > 0) {
            message += '\n' + changes.join('\n');
        }
        message += `\n<b>Edited by:</b> ${modifier?.name} <code>(ID: ${modifier?.id})</code>`;
        this.logClubEvent(newClub.id, message);
    }

    private logDeletedClub(club: Club, deletedBy: number): void {
        const deleter = this.userRepository.findUserById(deletedBy);
        const message = dedent`
            <b>🗑️ Club Deleted (deactivated)</b>

            <b>Club ID:</b> <code>${club.id}</code>
            <b>Name:</b> ${club.name}
            <b>City:</b> ${club.city || 'N/A'}
            <b>Deleted by:</b> ${deleter?.name} <code>(ID: ${deleter?.id})</code>
        `;
        this.logClubEvent(club.id, message);
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
        case ClubTelegramTopicType.CLUB_LOGS:
            return { ...topics, clubLogs: telegramTopic };
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
