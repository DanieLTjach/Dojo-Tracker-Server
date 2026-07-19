import dedent from 'dedent';
import type { ClubAchievementDefinition, ClubUserAchievement } from '../model/AchievementModels.ts';
import {
    ClubAchievementAlreadyAssignedError,
    ClubAchievementAssignmentAlreadyRevokedError,
    ClubAchievementAssignmentNotFoundError,
    ClubAchievementDefinitionArchivedError,
    ClubAchievementDefinitionNameAlreadyExistsError,
    ClubAchievementDefinitionNotFoundError,
    InvalidAchievementSourceError,
    TargetNotActiveClubMemberError,
    UnknownBuiltInAchievementCodeError,
} from '../error/ClubAchievementErrors.ts';
import { ClubAchievementRepository } from '../repository/ClubAchievementRepository.ts';
import { ClubMembershipRepository } from '../repository/ClubMembershipRepository.ts';
import { isManualAchievementCode } from '../data/manualAchievementCatalog.ts';
import { ClubService } from './ClubService.ts';
import { UserService } from './UserService.ts';
import LogService from './LogService.ts';
import { GLOBAL_LOGS_LOCALE, globalClubLogsTopic } from '../model/TelegramTopic.ts';
import { type SupportedLocale, t } from '../i18n/index.ts';
import { resolveClubLocale } from '../util/LocaleResolver.ts';

export interface AssignAchievementSource {
    builtInCode: string | undefined;
    definitionId: number | undefined;
    newDefinition: { name: string, description: string, icon: string | null } | undefined;
}

export class ClubAchievementService {
    private achievementRepository: ClubAchievementRepository = new ClubAchievementRepository();
    private membershipRepository: ClubMembershipRepository = new ClubMembershipRepository();
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

    assignAchievement(
        clubId: number,
        userId: number,
        source: AssignAchievementSource,
        note: string | null,
        awardedBy: number
    ): ClubUserAchievement {
        this.clubService.validateClubExists(clubId);
        this.validateActiveMember(clubId, userId);

        const sourcesProvided = [source.builtInCode, source.definitionId, source.newDefinition]
            .filter(v => v !== undefined).length;
        if (sourcesProvided !== 1) {
            throw new InvalidAchievementSourceError();
        }

        let builtInCode: string | null = null;
        let definitionId: number | null = null;

        if (source.builtInCode !== undefined) {
            if (!isManualAchievementCode(source.builtInCode)) {
                throw new UnknownBuiltInAchievementCodeError(source.builtInCode);
            }
            builtInCode = source.builtInCode;
            if (this.achievementRepository.findActiveAssignmentByBuiltInCode(clubId, userId, builtInCode)) {
                throw new ClubAchievementAlreadyAssignedError(userId);
            }
        } else if (source.definitionId !== undefined) {
            const definition = this.validateAssignableDefinition(clubId, source.definitionId);
            definitionId = definition.id;
            if (this.achievementRepository.findActiveAssignmentByDefinitionId(clubId, userId, definitionId)) {
                throw new ClubAchievementAlreadyAssignedError(userId);
            }
        } else {
            const newDefinition = this.createDefinition(
                clubId,
                source.newDefinition!.name,
                source.newDefinition!.description,
                source.newDefinition!.icon,
                awardedBy
            );
            definitionId = newDefinition.id;
        }

        const assignment = this.achievementRepository.createAssignment({
            clubId,
            userId,
            builtInCode,
            definitionId,
            note,
            awardedBy,
            awardedAt: new Date(),
        });

        this.logAssignmentAwarded(assignment, awardedBy);
        return assignment;
    }

    revokeAssignment(clubId: number, userId: number, assignmentId: number, revokedBy: number): ClubUserAchievement {
        this.clubService.validateClubExists(clubId);
        const assignment = this.getAssignment(clubId, userId, assignmentId);
        if (assignment.revokedAt !== null) {
            throw new ClubAchievementAssignmentAlreadyRevokedError(assignmentId);
        }

        this.achievementRepository.revokeAssignment(assignmentId, revokedBy, new Date());
        const revoked = this.getAssignment(clubId, userId, assignmentId);
        this.logAssignmentRevoked(revoked, revokedBy);
        return revoked;
    }

    private validateActiveMember(clubId: number, userId: number): void {
        const membership = this.membershipRepository.findMembership(clubId, userId);
        if (membership === undefined || membership.status !== 'ACTIVE') {
            throw new TargetNotActiveClubMemberError(userId);
        }
    }

    private getAssignment(clubId: number, userId: number, assignmentId: number): ClubUserAchievement {
        const assignment = this.achievementRepository.findAssignmentById(assignmentId);
        if (assignment === undefined || assignment.clubId !== clubId || assignment.userId !== userId) {
            throw new ClubAchievementAssignmentNotFoundError(assignmentId);
        }
        return assignment;
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

    private resolveAssignmentName(assignment: ClubUserAchievement, locale: SupportedLocale): string {
        if (assignment.builtInCode !== null) {
            return t(`achievements.manual.${assignment.builtInCode}.name`, locale);
        }
        return this.achievementRepository.findDefinitionById(assignment.definitionId!)!.name;
    }

    private logAssignmentAwarded(assignment: ClubUserAchievement, awardedBy: number): void {
        const club = this.clubService.getClubById(assignment.clubId);
        const target = this.userService.getUserById(assignment.userId);
        const awarder = this.userService.getUserById(awardedBy);
        this.logClubEvent(assignment.clubId, locale => {
            const tr = (key: string) => t(key, locale);
            const name = this.resolveAssignmentName(assignment, locale);
            const noteLine = assignment.note !== null
                ? `\n<b>${tr('telegram.achievementLog.noteLabel')}</b> ${assignment.note}`
                : '';
            return dedent`
                <b>${tr('telegram.achievementLog.awardedTitle')}</b>

                <b>${tr('telegram.achievementLog.clubLabel')}</b> ${club.name} <code>(ID: ${club.id})</code>
                <b>${tr('telegram.achievementLog.userLabel')}</b> ${target.name} <code>(ID: ${target.id})</code>
                <b>${tr('telegram.achievementLog.achievementLabel')}</b> ${name}${noteLine}
                <b>${tr('telegram.achievementLog.awardedByLabel')}</b> ${awarder.name} <code>(ID: ${awarder.id})</code>
            `;
        });
    }

    private logAssignmentRevoked(assignment: ClubUserAchievement, revokedBy: number): void {
        const club = this.clubService.getClubById(assignment.clubId);
        const target = this.userService.getUserById(assignment.userId);
        const revoker = this.userService.getUserById(revokedBy);
        this.logClubEvent(assignment.clubId, locale => {
            const tr = (key: string) => t(key, locale);
            const name = this.resolveAssignmentName(assignment, locale);
            return dedent`
                <b>${tr('telegram.achievementLog.revokedTitle')}</b>

                <b>${tr('telegram.achievementLog.clubLabel')}</b> ${club.name} <code>(ID: ${club.id})</code>
                <b>${tr('telegram.achievementLog.userLabel')}</b> ${target.name} <code>(ID: ${target.id})</code>
                <b>${tr('telegram.achievementLog.achievementLabel')}</b> ${name}
                <b>${tr('telegram.achievementLog.revokedByLabel')}</b> ${revoker.name} <code>(ID: ${revoker.id})</code>
            `;
        });
    }
}
