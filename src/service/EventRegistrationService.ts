import dedent from 'dedent';
import config from '../../config/config.ts';
import {
    EventCapacityReachedError,
    EventRegistrationNotFoundError,
    InvalidEventRegistrationStateError,
    MissingProfileNamesForTournamentRegistrationError,
    UserNotApprovedForTournamentError,
    UserNotRegisteredForTournamentError
} from '../error/EventRegistrationErrors.ts';
import { BadRequestError } from '../error/BaseErrors.ts';
import type { Event } from '../model/EventModels.ts';
import type { EventRegistration, EventRegistrationStatus } from '../model/EventRegistrationModels.ts';
import type { Profile } from '../model/ProfileModels.ts';
import type { User } from '../model/UserModels.ts';
import { globalClubLogsTopic } from '../model/TelegramTopic.ts';
import { EventRegistrationRepository } from '../repository/EventRegistrationRepository.ts';
import { ClubMembershipRepository } from '../repository/ClubMembershipRepository.ts';
import { ClubMembershipService } from './ClubMembershipService.ts';
import { ClubService } from './ClubService.ts';
import { EventService } from './EventService.ts';
import LogService from './LogService.ts';
import { ProfileService } from './ProfileService.ts';
import TelegramMessageService from './TelegramMessageService.ts';
import { UserService } from './UserService.ts';
import { t } from '../i18n/index.ts';

export class EventRegistrationService {
    private registrationRepository: EventRegistrationRepository = new EventRegistrationRepository();
    private membershipRepository: ClubMembershipRepository = new ClubMembershipRepository();
    private membershipService: ClubMembershipService = new ClubMembershipService();
    private clubService: ClubService = new ClubService();
    private eventService: EventService = new EventService();
    private profileService: ProfileService = new ProfileService();
    private userService: UserService = new UserService();

    apply(eventId: number, applicantId: number): EventRegistration {
        const event = this.eventService.getEventById(eventId);
        this.validateEventIsTournament(event);
        const applicant = this.userService.getUserById(applicantId);
        this.validateProfileHasNames(applicantId);

        if (event.clubId !== null) {
            this.ensureClubMembershipForApply(event.clubId, applicantId);
        }

        const existing = this.registrationRepository.findRegistration(eventId, applicantId);
        if (existing !== undefined) {
            if (existing.status === 'APPROVED' || existing.status === 'PENDING') {
                return existing;
            }
            // REJECTED → revert to PENDING
            this.registrationRepository.updateRegistrationStatus(eventId, applicantId, 'PENDING', applicantId);
        } else {
            const now = new Date();
            this.registrationRepository.createRegistration({
                eventId,
                userId: applicantId,
                status: 'PENDING',
                createdAt: now,
                modifiedAt: now,
                modifiedBy: applicantId
            });
        }

        const updated = this.getRegistration(eventId, applicantId);
        this.logApplied(event, applicant);
        return updated;
    }

    withdraw(eventId: number, applicantId: number): void {
        const event = this.eventService.getEventById(eventId);
        this.validateEventIsTournament(event);

        const registration = this.registrationRepository.findRegistration(eventId, applicantId);
        if (registration === undefined) {
            throw new EventRegistrationNotFoundError(event.name, applicantId);
        }
        if (registration.status !== 'PENDING' && registration.status !== 'APPROVED') {
            throw new InvalidEventRegistrationStateError(t('telegram.actions.withdraw'), registration.status, ['PENDING', 'APPROVED']);
        }

        this.registrationRepository.deleteRegistration(eventId, applicantId);
        const applicant = this.userService.getUserById(applicantId);
        this.logWithdrawn(event, applicant);
    }

    approve(eventId: number, targetUserId: number, modifierId: number): EventRegistration {
        const event = this.eventService.getEventById(eventId);
        this.validateEventIsTournament(event);
        const target = this.userService.getUserById(targetUserId);
        const modifier = this.userService.getUserById(modifierId);

        const registration = this.registrationRepository.findRegistration(eventId, targetUserId);
        if (registration === undefined) {
            throw new EventRegistrationNotFoundError(event.name, targetUserId);
        }
        if (registration.status !== 'PENDING') {
            throw new InvalidEventRegistrationStateError(t('telegram.actions.approve'), registration.status, ['PENDING']);
        }

        this.enforceCapacity(event);

        this.registrationRepository.updateRegistrationStatus(eventId, targetUserId, 'APPROVED', modifierId);

        if (event.clubId !== null) {
            this.activateMembershipIfNeeded(event.clubId, targetUserId, modifierId);
        }

        const updated = this.getRegistration(eventId, targetUserId);
        this.notifyTargetUser(target, event, t('telegram.notify.registrationApproved'));
        this.logApproved(event, target, modifier);
        return updated;
    }

    reject(eventId: number, targetUserId: number, modifierId: number): EventRegistration {
        const event = this.eventService.getEventById(eventId);
        this.validateEventIsTournament(event);
        const target = this.userService.getUserById(targetUserId);
        const modifier = this.userService.getUserById(modifierId);

        const registration = this.registrationRepository.findRegistration(eventId, targetUserId);
        if (registration === undefined) {
            throw new EventRegistrationNotFoundError(event.name, targetUserId);
        }
        if (registration.status !== 'PENDING' && registration.status !== 'APPROVED') {
            throw new InvalidEventRegistrationStateError(t('telegram.actions.reject'), registration.status, ['PENDING', 'APPROVED']);
        }

        this.registrationRepository.updateRegistrationStatus(eventId, targetUserId, 'REJECTED', modifierId);

        const updated = this.getRegistration(eventId, targetUserId);
        this.notifyTargetUser(target, event, t('telegram.notify.registrationRejected'));
        this.logRejected(event, target, modifier);
        return updated;
    }

    manualRegister(
        eventId: number,
        targetUserId: number,
        modifierId: number,
        profileNames?: { firstName: string; lastName: string },
        isFillerPlayer?: boolean
    ): EventRegistration {
        const event = this.eventService.getEventById(eventId);
        this.validateEventIsTournament(event);
        const target = this.userService.getUserById(targetUserId);
        const modifier = this.userService.getUserById(modifierId);

        if (profileNames !== undefined) {
            this.profileService.updateProfileNames(
                targetUserId,
                profileNames.firstName,
                profileNames.lastName,
                modifierId
            );
        }

        this.validateProfileHasNames(targetUserId);

        const existing = this.registrationRepository.findRegistration(eventId, targetUserId);
        if (existing === undefined || existing.status !== 'APPROVED') {
            this.enforceCapacity(event);
        }

        const now = new Date();
        if (existing === undefined) {
            this.registrationRepository.createRegistration({
                eventId,
                userId: targetUserId,
                status: 'APPROVED',
                isFillerPlayer: isFillerPlayer ?? false,
                createdAt: now,
                modifiedAt: now,
                modifiedBy: modifierId
            });
        } else {
            if (existing.status !== 'APPROVED') {
                this.registrationRepository.updateRegistrationStatus(eventId, targetUserId, 'APPROVED', modifierId);
            }
            if (isFillerPlayer !== undefined) {
                this.registrationRepository.updateRegistrationIsFillerPlayer(eventId, targetUserId, isFillerPlayer, modifierId);
            }
        }

        if (event.clubId !== null) {
            this.upsertActiveMembership(event.clubId, targetUserId, modifierId);
        }

        const updated = this.getRegistration(eventId, targetUserId);
        this.notifyTargetUser(target, event, t('telegram.notify.registeredForTournament'));
        this.logManualRegistered(event, target, modifier);
        return updated;
    }

    setFillerPlayer(
        eventId: number,
        targetUserId: number,
        isFillerPlayer: boolean,
        modifierId: number
    ): EventRegistration {
        const event = this.eventService.getEventById(eventId);
        this.validateEventIsTournament(event);
        this.userService.validateUserIsActiveById(targetUserId);
        this.userService.validateUserIsActiveById(modifierId);

        const registration = this.registrationRepository.findRegistration(eventId, targetUserId);
        if (registration === undefined) {
            throw new EventRegistrationNotFoundError(event.name, targetUserId);
        }

        this.registrationRepository.updateRegistrationIsFillerPlayer(eventId, targetUserId, isFillerPlayer, modifierId);
        return this.getRegistration(eventId, targetUserId);
    }

    editParticipantProfileNames(
        eventId: number,
        targetUserId: number,
        firstName: string | null | undefined,
        lastName: string | null | undefined,
        modifierId: number
    ): Profile {
        const event = this.eventService.getEventById(eventId);
        this.validateEventIsTournament(event);
        const target = this.userService.getUserById(targetUserId);
        const modifier = this.userService.getUserById(modifierId);

        const registration = this.registrationRepository.findRegistration(eventId, targetUserId);
        if (registration === undefined) {
            throw new EventRegistrationNotFoundError(event.name, targetUserId);
        }

        const before = this.profileService.getProfileByUserId(targetUserId);
        const profile = this.profileService.updateProfileNames(targetUserId, firstName, lastName, modifierId);
        this.logProfileNamesUpdated(
            event,
            target,
            modifier,
            { firstName: before?.firstName ?? null, lastName: before?.lastName ?? null },
            { firstName: profile.firstName, lastName: profile.lastName }
        );
        return profile;
    }

    getRegistrationsForEvent(eventId: number, status?: EventRegistrationStatus): EventRegistration[] {
        this.eventService.validateEventExists(eventId);
        if (status !== undefined) {
            return this.registrationRepository.findRegistrationsByEventIdAndStatus(eventId, status);
        }
        return this.registrationRepository.findRegistrationsByEventId(eventId);
    }

    getRegistrationsForUser(userId: number, status?: EventRegistrationStatus): EventRegistration[] {
        if (status !== undefined) {
            return this.registrationRepository.findRegistrationsByUserIdAndStatus(userId, status);
        }
        return this.registrationRepository.findRegistrationsByUserId(userId);
    }

    validateUserIsApprovedParticipant(eventId: number, userId: number): void {
        const event = this.eventService.getEventById(eventId);
        this.validateEventIsTournament(event);

        const registration = this.registrationRepository.findRegistration(eventId, userId);
        if (registration === undefined) {
            throw new UserNotRegisteredForTournamentError(event.name, userId);
        }
        if (registration.status !== 'APPROVED') {
            throw new UserNotApprovedForTournamentError(event.name, userId, registration.status);
        }
    }

    private getRegistration(eventId: number, userId: number): EventRegistration {
        const registration = this.registrationRepository.findRegistration(eventId, userId);
        if (registration === undefined) {
            const event = this.eventService.getEventById(eventId);
            throw new EventRegistrationNotFoundError(event.name, userId);
        }
        return registration;
    }

    private validateEventIsTournament(event: Event): void {
        if (event.type !== 'TOURNAMENT') {
            throw new BadRequestError('eventNotTournament', { type: event.type });
        }
    }

    private validateProfileHasNames(userId: number): void {
        const profile = this.profileService.getProfileByUserId(userId);
        if (profile === undefined || profile.firstName === null || profile.lastName === null) {
            throw new MissingProfileNamesForTournamentRegistrationError();
        }
    }

    private enforceCapacity(event: Event): void {
        if (event.maxParticipants === null) {
            return;
        }
        const approvedCount = this.registrationRepository.countApprovedByEventId(event.id);
        if (approvedCount >= event.maxParticipants) {
            throw new EventCapacityReachedError(event.name, event.maxParticipants);
        }
    }

    private ensureClubMembershipForApply(clubId: number, userId: number): void {
        const membership = this.membershipRepository.findMembership(clubId, userId);
        const now = new Date();
        if (membership === undefined) {
            this.membershipRepository.createMembership({
                clubId,
                userId,
                role: 'MEMBER',
                status: 'PENDING',
                createdAt: now,
                modifiedAt: now,
                modifiedBy: userId
            });
            return;
        }
        if (membership.status === 'INACTIVE') {
            this.membershipRepository.updateMembershipStatus(clubId, userId, 'PENDING', userId);
        }
        // PENDING / ACTIVE: leave as-is
    }

    private activateMembershipIfNeeded(clubId: number, userId: number, modifierId: number): void {
        const membership = this.membershipRepository.findMembership(clubId, userId);
        if (membership === undefined) {
            const now = new Date();
            this.membershipRepository.createMembership({
                clubId,
                userId,
                role: 'MEMBER',
                status: 'ACTIVE',
                createdAt: now,
                modifiedAt: now,
                modifiedBy: modifierId
            });
            return;
        }
        if (membership.status === 'PENDING') {
            this.membershipService.activateMember(clubId, userId, modifierId);
            return;
        }
        if (membership.status === 'INACTIVE') {
            this.membershipRepository.updateMembershipStatus(clubId, userId, 'ACTIVE', modifierId);
        }
    }

    private upsertActiveMembership(clubId: number, userId: number, modifierId: number): void {
        const membership = this.membershipRepository.findMembership(clubId, userId);
        const now = new Date();
        if (membership === undefined) {
            this.membershipRepository.createMembership({
                clubId,
                userId,
                role: 'MEMBER',
                status: 'ACTIVE',
                createdAt: now,
                modifiedAt: now,
                modifiedBy: modifierId
            });
            return;
        }
        if (membership.status !== 'ACTIVE') {
            this.membershipRepository.updateMembershipStatus(clubId, userId, 'ACTIVE', modifierId);
        }
    }

    private notifyTargetUser(target: User, event: Event, headline: string): void {
        if (target.telegramId === null) {
            return;
        }
        const message = dedent`
            <b>${headline}</b>

            <b>${t('telegram.notify.tournamentLabel')}</b> ${event.name}
            <a href="${config.botUrl}?startapp=event_${event.id}">${t('telegram.notify.openTournamentPage')}</a>
        `;
        void TelegramMessageService.sendDirectMessage(target.telegramId, message);
    }

    private logEvent(event: Event, message: string): void {
        LogService.logInfo(message, globalClubLogsTopic);
        if (event.clubId !== null) {
            const clubLogsTopic = this.clubService.getClubTelegramTopics(event.clubId).clubLogs;
            if (clubLogsTopic !== null) {
                LogService.logInfo(message, clubLogsTopic);
            }
        }
    }

    private formatParticipant(user: User): string {
        const profile = this.profileService.getProfileByUserId(user.id);
        const firstName = profile?.firstName ?? '—';
        const lastName = profile?.lastName ?? '—';
        return `${user.name} <code>(ID: ${user.id})</code>\n<b>${t('telegram.registrationLog.nameLabel')}</b> ${firstName} ${lastName}`;
    }

    private logApplied(event: Event, applicant: User): void {
        const message = dedent`
            <b>${t('telegram.registrationLog.titleApplied')}</b>

            <b>${t('telegram.registrationLog.tournamentLabel')}</b> ${event.name} <code>(ID: ${event.id})</code>
            <b>${t('telegram.registrationLog.participantLabel')}</b> ${this.formatParticipant(applicant)}
        `;
        this.logEvent(event, message);
    }

    private logApproved(event: Event, target: User, modifier: User): void {
        const message = dedent`
            <b>${t('telegram.registrationLog.titleApproved')}</b>

            <b>${t('telegram.registrationLog.tournamentLabel')}</b> ${event.name} <code>(ID: ${event.id})</code>
            <b>${t('telegram.registrationLog.participantLabel')}</b> ${this.formatParticipant(target)}
            <b>${t('telegram.registrationLog.approvedByLabel')}</b> ${modifier.name} <code>(ID: ${modifier.id})</code>
        `;
        this.logEvent(event, message);
    }

    private logRejected(event: Event, target: User, modifier: User): void {
        const message = dedent`
            <b>${t('telegram.registrationLog.titleRejected')}</b>

            <b>${t('telegram.registrationLog.tournamentLabel')}</b> ${event.name} <code>(ID: ${event.id})</code>
            <b>${t('telegram.registrationLog.participantLabel')}</b> ${this.formatParticipant(target)}
            <b>${t('telegram.registrationLog.rejectedByLabel')}</b> ${modifier.name} <code>(ID: ${modifier.id})</code>
        `;
        this.logEvent(event, message);
    }

    private logWithdrawn(event: Event, applicant: User): void {
        const message = dedent`
            <b>${t('telegram.registrationLog.titleWithdrawn')}</b>

            <b>${t('telegram.registrationLog.tournamentLabel')}</b> ${event.name} <code>(ID: ${event.id})</code>
            <b>${t('telegram.registrationLog.participantLabel')}</b> ${this.formatParticipant(applicant)}
        `;
        this.logEvent(event, message);
    }

    private logManualRegistered(event: Event, target: User, modifier: User): void {
        const message = dedent`
            <b>${t('telegram.registrationLog.titleManualRegistered')}</b>

            <b>${t('telegram.registrationLog.tournamentLabel')}</b> ${event.name} <code>(ID: ${event.id})</code>
            <b>${t('telegram.registrationLog.participantLabel')}</b> ${this.formatParticipant(target)}
            <b>${t('telegram.registrationLog.addedByLabel')}</b> ${modifier.name} <code>(ID: ${modifier.id})</code>
        `;
        this.logEvent(event, message);
    }

    private logProfileNamesUpdated(
        event: Event,
        target: User,
        modifier: User,
        before: { firstName: string | null; lastName: string | null },
        after: { firstName: string | null; lastName: string | null }
    ): void {
        const fmt = (n: string | null): string => n ?? '—';
        const message = dedent`
            <b>${t('telegram.registrationLog.titleProfileNamesUpdated')}</b>

            <b>${t('telegram.registrationLog.tournamentLabel')}</b> ${event.name} <code>(ID: ${event.id})</code>
            <b>${t('telegram.registrationLog.participantLabel')}</b> ${target.name} <code>(ID: ${target.id})</code>
            <b>${t('telegram.registrationLog.beforeLabel')}</b> ${fmt(before.firstName)} ${fmt(before.lastName)}
            <b>${t('telegram.registrationLog.afterLabel')}</b> ${fmt(after.firstName)} ${fmt(after.lastName)}
            <b>${t('telegram.registrationLog.updatedByLabel')}</b> ${modifier.name} <code>(ID: ${modifier.id})</code>
        `;
        this.logEvent(event, message);
    }
}
