import { ClubNameAlreadyExistsError, ClubNotFoundError } from '../error/ClubErrors.ts';
import type { Club, ClubTelegramTopics } from '../model/ClubModels.ts';
import { ClubTelegramTopicType, GLOBAL_LOGS_LOCALE, globalClubLogsTopic } from '../model/TelegramTopic.ts';
import type { TelegramTopic } from '../model/TelegramTopic.ts';
import { ClubRepository } from '../repository/ClubRepository.ts';
import LogService from './LogService.ts';
import dedent from 'dedent';
import { UserRepository } from '../repository/UserRepository.ts';
import { SupportedLocale, t } from '../i18n/index.ts';
import { resolveClubLocale } from '../util/LocaleResolver.ts';

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
            country: data.country,
            locale: data.locale,
            description: data.description ?? null,
            contactInfo: data.contactInfo ?? null,
            isActive: data.isActive ?? true,
            createdAt: now,
            modifiedBy,
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
            country: data.country,
            locale: data.locale,
            description: data.description ?? null,
            contactInfo: data.contactInfo ?? null,
            isActive: data.isActive ?? true,
            modifiedAt: now,
            modifiedBy,
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
            clubLogs: null,
            main: null,
        };
    }

    setClubTelegramTopics(clubId: number, topics: ClubTelegramTopics, modifiedBy: number) {
        return this.clubRepository.setClubTelegramTopics(clubId, topics, new Date(), modifiedBy);
    }

    private logClubEvent(club: Club, buildMessage: (locale: SupportedLocale) => string): void {
        LogService.logInfo(buildMessage(GLOBAL_LOGS_LOCALE), globalClubLogsTopic);
        const clubLogsTopic = this.getClubTelegramTopics(club.id).clubLogs;
        if (clubLogsTopic !== null) {
            const locale = resolveClubLocale(club);
            LogService.logInfo(buildMessage(locale), clubLogsTopic);
        }
    }

    private logCreatedClub(club: Club, createdBy: number): void {
        const creator = this.userRepository.findUserById(createdBy);
        this.logClubEvent(club, locale => {
            const tr = (key: string) => t(key, locale);
            return dedent`
                <b>${tr('telegram.clubLog.createdTitle')}</b>

                <b>${tr('telegram.clubLog.clubIdLabel')}</b> <code>${club.id}</code>
                <b>${tr('telegram.clubLog.nameLabel')}</b> ${club.name}
                <b>${tr('telegram.clubLog.cityLabel')}</b> ${club.city || tr('telegram.clubLog.noValue')}
                <b>${tr('telegram.clubLog.countryLabel')}</b> ${club.country}
                <b>${tr('telegram.clubLog.localeLabel')}</b> ${club.locale}
                <b>${tr('telegram.clubLog.addressLabel')}</b> ${club.address || tr('telegram.clubLog.noValue')}
                <b>${tr('telegram.clubLog.descriptionLabel')}</b> ${club.description || tr('telegram.clubLog.noValue')}
                <b>${tr('telegram.clubLog.contactInfoLabel')}</b> ${club.contactInfo || tr('telegram.clubLog.noValue')}
                <b>${tr('telegram.clubLog.createdByLabel')}</b> ${creator?.name} <code>(ID: ${creator?.id})</code>
            `;
        });
    }

    private logEditedClub(oldClub: Club, newClub: Club, modifiedBy: number): void {
        const modifier = this.userRepository.findUserById(modifiedBy);
        this.logClubEvent(newClub, locale => {
            const tr = (key: string) => t(key, locale);
            const changes: string[] = [];

            if (oldClub.name !== newClub.name) {
                changes.push(`<b>${tr('telegram.clubLog.nameLabel')}</b> ${oldClub.name} → ${newClub.name}`);
            }
            if (oldClub.city !== newClub.city) {
                changes.push(
                    `<b>${tr('telegram.clubLog.cityLabel')}</b> ${oldClub.city || tr('telegram.clubLog.noValue')} → ${
                        newClub.city || tr('telegram.clubLog.noValue')
                    }`
                );
            }
            if (oldClub.country !== newClub.country) {
                changes.push(`<b>${tr('telegram.clubLog.countryLabel')}</b> ${oldClub.country} → ${newClub.country}`);
            }
            if (oldClub.locale !== newClub.locale) {
                changes.push(`<b>${tr('telegram.clubLog.localeLabel')}</b> ${oldClub.locale} → ${newClub.locale}`);
            }
            if (oldClub.address !== newClub.address) {
                changes.push(
                    `<b>${tr('telegram.clubLog.addressLabel')}</b> ${
                        oldClub.address || tr('telegram.clubLog.noValue')
                    } → ${newClub.address || tr('telegram.clubLog.noValue')}`
                );
            }
            if (oldClub.description !== newClub.description) {
                changes.push(
                    `<b>${tr('telegram.clubLog.descriptionLabel')}</b> ${
                        oldClub.description || tr('telegram.clubLog.noValue')
                    } → ${newClub.description || tr('telegram.clubLog.noValue')}`
                );
            }
            if (oldClub.contactInfo !== newClub.contactInfo) {
                changes.push(
                    `<b>${tr('telegram.clubLog.contactInfoLabel')}</b> ${
                        oldClub.contactInfo || tr('telegram.clubLog.noValue')
                    } → ${newClub.contactInfo || tr('telegram.clubLog.noValue')}`
                );
            }
            if (oldClub.isActive !== newClub.isActive) {
                changes.push(
                    `<b>${tr('telegram.clubLog.isActiveLabel')}</b> ${oldClub.isActive} → ${newClub.isActive}`
                );
            }

            let message = dedent`
                <b>${tr('telegram.clubLog.editedTitle')}</b>

                <b>${tr('telegram.clubLog.clubIdLabel')}</b> <code>${newClub.id}</code>
                <b>${tr('telegram.clubLog.nameLabel')}</b> ${newClub.name}
            `;
            if (changes.length > 0) {
                message += '\n' + changes.join('\n');
            }
            message += `\n<b>${
                tr('telegram.clubLog.editedByLabel')
            }</b> ${modifier?.name} <code>(ID: ${modifier?.id})</code>`;
            return message;
        });
    }

    private logDeletedClub(club: Club, deletedBy: number): void {
        const deleter = this.userRepository.findUserById(deletedBy);
        this.logClubEvent(club, locale => {
            const tr = (key: string) => t(key, locale);
            return dedent`
                <b>${tr('telegram.clubLog.deletedTitle')}</b>

                <b>${tr('telegram.clubLog.clubIdLabel')}</b> <code>${club.id}</code>
                <b>${tr('telegram.clubLog.nameLabel')}</b> ${club.name}
                <b>${tr('telegram.clubLog.cityLabel')}</b> ${club.city || tr('telegram.clubLog.noValue')}
                <b>${tr('telegram.clubLog.deletedByLabel')}</b> ${deleter?.name} <code>(ID: ${deleter?.id})</code>
            `;
        });
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
        case ClubTelegramTopicType.MAIN:
            return { ...topics, main: telegramTopic };
    }
}

export function unsetClubTelegramTopic(
    topics: ClubTelegramTopics,
    topicType: ClubTelegramTopicType
): ClubTelegramTopics {
    switch (topicType) {
        case ClubTelegramTopicType.RATING:
            return { ...topics, rating: null };
        case ClubTelegramTopicType.USER_LOGS:
            return { ...topics, userLogs: null };
        case ClubTelegramTopicType.GAME_LOGS:
            return { ...topics, gameLogs: null };
        case ClubTelegramTopicType.CLUB_LOGS:
            return { ...topics, clubLogs: null };
        case ClubTelegramTopicType.MAIN:
            return { ...topics, main: null };
    }
}

export interface ClubData {
    name: string;
    address?: string | null | undefined;
    city?: string | null | undefined;
    country: string;
    locale: string;
    description?: string | null | undefined;
    contactInfo?: string | null | undefined;
    isActive?: boolean | null | undefined;
}
