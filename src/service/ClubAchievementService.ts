import dedent from 'dedent';
import type { ClubAchievementDefinition } from '../model/AchievementModels.ts';
import {
    ClubAchievementDefinitionArchivedError,
    ClubAchievementDefinitionNameAlreadyExistsError,
    ClubAchievementDefinitionNotFoundError,
} from '../error/ClubAchievementErrors.ts';
import { ClubAchievementRepository } from '../repository/ClubAchievementRepository.ts';
import { ClubService } from './ClubService.ts';
import { UserService } from './UserService.ts';
import LogService from './LogService.ts';
import { GLOBAL_LOGS_LOCALE, globalClubLogsTopic } from '../model/TelegramTopic.ts';
import { type SupportedLocale, t } from '../i18n/index.ts';
import { resolveClubLocale } from '../util/LocaleResolver.ts';

export class ClubAchievementService {
    private achievementRepository: ClubAchievementRepository = new ClubAchievementRepository();
    private clubService: ClubService = new ClubService();
    private userService: UserService = new UserService();

    getCatalog(clubId: number): ClubAchievementDefinition[] {
        this.clubService.validateClubExists(clubId);
        return this.achievementRepository.findDefinitionsByClubId(clubId);
    }

    createDefinition(
        clubId: number,
        name: string,
        description: string,
        icon: string | null,
        createdBy: number
    ): ClubAchievementDefinition {
        this.clubService.validateClubExists(clubId);

        const existing = this.achievementRepository.findActiveDefinitionByName(clubId, name);
        if (existing !== undefined) {
            throw new ClubAchievementDefinitionNameAlreadyExistsError(name);
        }

        const definition = this.achievementRepository.createDefinition({
            clubId,
            name,
            description,
            icon,
            createdBy,
            createdAt: new Date(),
        });

        this.logDefinitionCreated(definition, createdBy);
        return definition;
    }

    setDefinitionArchived(
        clubId: number,
        definitionId: number,
        archived: boolean,
        modifiedBy: number
    ): ClubAchievementDefinition {
        this.clubService.validateClubExists(clubId);
        const definition = this.getDefinition(clubId, definitionId);

        if (archived) {
            this.achievementRepository.setDefinitionArchived(definitionId, true, modifiedBy, new Date());
        } else {
            const activeWithSameName = this.achievementRepository.findActiveDefinitionByName(
                clubId,
                definition.name
            );
            if (activeWithSameName !== undefined && activeWithSameName.id !== definitionId) {
                throw new ClubAchievementDefinitionNameAlreadyExistsError(definition.name);
            }
            this.achievementRepository.setDefinitionArchived(definitionId, false, modifiedBy, new Date());
        }

        const updated = this.getDefinition(clubId, definitionId);
        this.logDefinitionArchivedChanged(updated, archived, modifiedBy);
        return updated;
    }

    /** Throws if the definition doesn't exist, belongs to another club, or is archived. */
    validateAssignableDefinition(clubId: number, definitionId: number): ClubAchievementDefinition {
        const definition = this.getDefinition(clubId, definitionId);
        if (definition.archivedAt !== null) {
            throw new ClubAchievementDefinitionArchivedError(definition.name);
        }
        return definition;
    }

    private getDefinition(clubId: number, definitionId: number): ClubAchievementDefinition {
        const definition = this.achievementRepository.findDefinitionById(definitionId);
        if (definition === undefined || definition.clubId !== clubId) {
            throw new ClubAchievementDefinitionNotFoundError(definitionId);
        }
        return definition;
    }

    private logClubEvent(clubId: number, buildMessage: (locale: SupportedLocale) => string): void {
        LogService.logInfo(buildMessage(GLOBAL_LOGS_LOCALE), globalClubLogsTopic);
        const clubLogsTopic = this.clubService.getClubTelegramTopics(clubId).clubLogs;
        if (clubLogsTopic !== null) {
            const locale = resolveClubLocale(this.clubService.getClubById(clubId));
            LogService.logInfo(buildMessage(locale), clubLogsTopic);
        }
    }

    private logDefinitionCreated(definition: ClubAchievementDefinition, createdBy: number): void {
        const club = this.clubService.getClubById(definition.clubId);
        const creator = this.userService.getUserById(createdBy);
        this.logClubEvent(definition.clubId, locale => {
            const tr = (key: string) => t(key, locale);
            return dedent`
                <b>${tr('telegram.achievementLog.definitionCreatedTitle')}</b>

                <b>${tr('telegram.achievementLog.clubLabel')}</b> ${club.name} <code>(ID: ${club.id})</code>
                <b>${tr('telegram.achievementLog.nameLabel')}</b> ${definition.name}
                <b>${tr('telegram.achievementLog.createdByLabel')}</b> ${creator.name} <code>(ID: ${creator.id})</code>
            `;
        });
    }

    private logDefinitionArchivedChanged(
        definition: ClubAchievementDefinition,
        archived: boolean,
        modifiedBy: number
    ): void {
        const club = this.clubService.getClubById(definition.clubId);
        const modifier = this.userService.getUserById(modifiedBy);
        this.logClubEvent(definition.clubId, locale => {
            const tr = (key: string) => t(key, locale);
            const titleKey = archived
                ? 'telegram.achievementLog.definitionArchivedTitle'
                : 'telegram.achievementLog.definitionUnarchivedTitle';
            const byLabelKey = archived
                ? 'telegram.achievementLog.archivedByLabel'
                : 'telegram.achievementLog.unarchivedByLabel';
            return dedent`
                <b>${tr(titleKey)}</b>

                <b>${tr('telegram.achievementLog.clubLabel')}</b> ${club.name} <code>(ID: ${club.id})</code>
                <b>${tr('telegram.achievementLog.nameLabel')}</b> ${definition.name}
                <b>${tr(byLabelKey)}</b> ${modifier.name} <code>(ID: ${modifier.id})</code>
            `;
        });
    }
}
