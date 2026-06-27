import {
    DraftNotStartableError,
    InsufficientTeamPermissionsError,
    NotEnoughApprovedForDraftError,
    TeamCompositionLockedError,
    TeamCountLimitReachedError,
    TeamFullError,
    TeamMemberNotFoundError,
    TeamNotFoundError,
    TeamNotInEventError,
    TeamsNotAllowedForFormatError,
    UserAlreadyInTeamForEventError,
    UserNotApprovedParticipantError,
} from '../error/TeamErrors.ts';
import { ClubRole } from '../model/ClubModels.ts';
import { EventFormat } from '../model/EventModels.ts';
import type { Event } from '../model/EventModels.ts';
import { EventRegistrationStatus } from '../model/EventRegistrationModels.ts';
import type { PlayerTeamMap, Team, TeamStanding } from '../model/TeamModels.ts';
import { TeamRole } from '../model/TeamModels.ts';
import { TournamentStatus } from '../model/TournamentModels.ts';
import { ClubMembershipRepository } from '../repository/ClubMembershipRepository.ts';
import { EventRegistrationRepository } from '../repository/EventRegistrationRepository.ts';
import { TeamRepository } from '../repository/TeamRepository.ts';
import { EventService } from './EventService.ts';
import { RATING_TO_POINTS_COEFFICIENT } from './RatingService.ts';
import { UserService } from './UserService.ts';

export class TeamService {
    private teamRepository: TeamRepository = new TeamRepository();
    private registrationRepository: EventRegistrationRepository = new EventRegistrationRepository();
    private membershipRepository: ClubMembershipRepository = new ClubMembershipRepository();
    private eventService: EventService = new EventService();
    private userService: UserService = new UserService();

    listTeamsForEvent(eventId: number): Team[] {
        this.eventService.validateEventExists(eventId);
        return this.teamRepository.findTeamsByEventId(eventId);
    }

    getTeam(teamId: number): Team {
        const team = this.teamRepository.findTeamById(teamId);
        if (team === undefined) {
            throw new TeamNotFoundError(teamId);
        }
        return team;
    }

    getAvailablePlayers(eventId: number): ReturnType<TeamRepository['findUnteamedApprovedPlayers']> {
        this.eventService.validateEventExists(eventId);
        return this.teamRepository.findUnteamedApprovedPlayers(eventId);
    }

    /**
     * Team standings: each team's total = sum of members' teamRating for the event,
     * normalized to rating units. Ordered best-first; tied totals share a place.
     */
    getTeamStandings(eventId: number): TeamStanding[] {
        this.eventService.validateEventExists(eventId);
        const rows = this.teamRepository.findTeamStandings(eventId);

        let place = 0;
        let prevTotal: number | undefined;
        return rows.map((row, index) => {
            if (prevTotal === undefined || row.totalTeamRating !== prevTotal) {
                place = index + 1;
                prevTotal = row.totalTeamRating;
            }
            return {
                team: { id: row.teamId, name: row.teamName },
                totalTeamRating: row.totalTeamRating / RATING_TO_POINTS_COEFFICIENT,
                gamesCounted: row.gamesCounted,
                place,
            };
        });
    }

    /**
     * userId -> teamId for the event. Reused by seating (to forbid same-team tables)
     * and rating (to attribute a game to a team).
     */
    getPlayerTeamMapForEvent(eventId: number): PlayerTeamMap {
        const map: PlayerTeamMap = new Map();
        for (const { userId, teamId } of this.teamRepository.findPlayerTeamMapForEvent(eventId)) {
            map.set(userId, teamId);
        }
        return map;
    }

    /**
     * Create a team for a team event. The acting user becomes its CAPTAIN unless a
     * club manager/admin creates it on someone else's behalf (captainUserId). On a
     * tournament the team count is capped at teamConfig.teamCount; seasons are
     * uncapped. The captain must be an eligible (approved) participant and not
     * already on a team for this event.
     */
    createTeam(eventId: number, name: string, captainUserId: number, actingUserId: number): Team {
        const event = this.getTeamEvent(eventId);
        this.assertCompositionEditable(event);

        // Captains may create their own team; managers/admins may create for anyone.
        const isManager = this.isClubManagerOrAdmin(event.clubId, actingUserId);
        if (!isManager && captainUserId !== actingUserId) {
            throw new InsufficientTeamPermissionsError(event.name);
        }

        this.assertTeamCountUnderLimit(event);
        this.assertEligibleParticipant(event, captainUserId);
        this.assertNotAlreadyTeamed(eventId, captainUserId);

        const teamId = this.teamRepository.createTeam(eventId, name, new Date(), actingUserId);
        this.teamRepository.addMember(teamId, eventId, captainUserId, TeamRole.CAPTAIN, actingUserId);
        return this.getTeam(teamId);
    }

    renameTeam(eventId: number, teamId: number, name: string, actingUserId: number): Team {
        const event = this.getTeamEvent(eventId);
        const team = this.getTeamInEvent(eventId, teamId);
        this.assertCompositionEditable(event);
        this.authorizeTeamManagement(event, teamId, actingUserId);
        this.teamRepository.updateTeamName(team.id, name, actingUserId);
        return this.getTeam(teamId);
    }

    deleteTeam(eventId: number, teamId: number, actingUserId: number): void {
        const event = this.getTeamEvent(eventId);
        this.getTeamInEvent(eventId, teamId);
        this.assertCompositionEditable(event);
        this.authorizeTeamManagement(event, teamId, actingUserId);
        this.teamRepository.deleteTeam(teamId);
    }

    addMember(eventId: number, teamId: number, userId: number, actingUserId: number): Team {
        const event = this.getTeamEvent(eventId);
        const team = this.getTeamInEvent(eventId, teamId);
        this.assertCompositionEditable(event);
        this.authorizeTeamManagement(event, teamId, actingUserId);
        this.assertEligibleParticipant(event, userId);
        this.assertNotAlreadyTeamed(eventId, userId);
        this.assertTeamHasRoom(event, team);

        this.teamRepository.addMember(teamId, eventId, userId, TeamRole.MEMBER, actingUserId);
        return this.getTeam(teamId);
    }

    removeMember(eventId: number, teamId: number, userId: number, actingUserId: number): Team {
        const event = this.getTeamEvent(eventId);
        const team = this.getTeamInEvent(eventId, teamId);
        this.assertCompositionEditable(event);
        this.authorizeTeamManagement(event, teamId, actingUserId);

        const member = team.members.find(m => m.userId === userId);
        if (member === undefined) {
            throw new TeamMemberNotFoundError(teamId, userId);
        }
        this.teamRepository.removeMember(teamId, userId);
        return this.getTeam(teamId);
    }

    /**
     * Close registration and move the team tournament into the DRAFT phase. Only a
     * club manager/admin may do this, only while still in CREATED (registration
     * open), and only once at least minParticipants are APPROVED. Pending
     * applicants are left untouched (they can still be approved later as fillers).
     */
    startDraft(eventId: number, actingUserId: number): Event {
        const event = this.getTeamEvent(eventId);
        if (!this.isClubManagerOrAdmin(event.clubId, actingUserId)) {
            throw new InsufficientTeamPermissionsError(event.name);
        }
        if (event.tournament!.status !== TournamentStatus.CREATED) {
            throw new DraftNotStartableError(event.name);
        }

        const required = this.requiredDraftMinimum(event);
        const approved = this.registrationRepository.countApprovedByEventId(eventId);
        if (approved < required) {
            throw new NotEnoughApprovedForDraftError(event.name, required, approved);
        }

        return this.eventService.setTournamentStatus(eventId, TournamentStatus.DRAFT, actingUserId);
    }

    // --- helpers ---

    private getTeamEvent(eventId: number): Event {
        const event = this.eventService.getEventById(eventId);
        if (event.format !== EventFormat.TEAM && event.format !== EventFormat.HYBRID) {
            throw new TeamsNotAllowedForFormatError(event.name);
        }
        return event;
    }

    private getTeamInEvent(eventId: number, teamId: number): Team {
        const team = this.getTeam(teamId);
        if (team.eventId !== eventId) {
            throw new TeamNotInEventError(teamId, eventId);
        }
        return team;
    }

    /**
     * Team management (rename / members / delete) is allowed for the team's captain
     * or any club OWNER/MODERATOR/admin. Captains may only touch their own team.
     */
    private authorizeTeamManagement(event: Event, teamId: number, userId: number): void {
        if (this.isClubManagerOrAdmin(event.clubId, userId)) {
            return;
        }
        if (this.teamRepository.isCaptainOfTeam(teamId, userId)) {
            return;
        }
        throw new InsufficientTeamPermissionsError(event.name);
    }

    /** Non-throwing: true for a system admin or an ACTIVE OWNER/MODERATOR of the club. */
    private isClubManagerOrAdmin(clubId: number | null, userId: number): boolean {
        const user = this.userService.getUserById(userId);
        if (user.isAdmin) {
            return true;
        }
        if (clubId === null) {
            return false;
        }
        const role = this.membershipRepository.getUserClubRole(clubId, userId);
        return role === ClubRole.OWNER || role === ClubRole.MODERATOR;
    }

    private assertCompositionEditable(event: Event): void {
        // Only tournaments have a lifecycle that locks composition; team seasons
        // (future) stay editable. For tournaments, composition is editable while
        // the tournament has not yet started its rounds (CREATED or DRAFT).
        const status = event.tournament?.status;
        if (status !== undefined && status !== TournamentStatus.CREATED && status !== TournamentStatus.DRAFT) {
            throw new TeamCompositionLockedError(event.name);
        }
    }

    private assertTeamCountUnderLimit(event: Event): void {
        const teamCount = event.config?.teamConfig?.teamCount;
        if (teamCount === undefined) {
            return; // no cap configured (e.g. future team seasons)
        }
        if (this.teamRepository.countTeamsByEventId(event.id) >= teamCount) {
            throw new TeamCountLimitReachedError(teamCount);
        }
    }

    private assertTeamHasRoom(event: Event, team: Team): void {
        const teamSize = event.config?.teamConfig?.teamSize;
        if (teamSize === undefined) {
            return;
        }
        if (team.members.length >= teamSize) {
            throw new TeamFullError(team.name, teamSize);
        }
    }

    private assertEligibleParticipant(event: Event, userId: number): void {
        this.userService.validateUserExistsById(userId);
        // Tournaments draft from APPROVED registrations. (Future team seasons would
        // branch here to allow active club members.)
        if (event.type === 'TOURNAMENT') {
            const registration = this.registrationRepository.findRegistration(event.id, userId);
            if (registration?.status !== EventRegistrationStatus.APPROVED) {
                throw new UserNotApprovedParticipantError(userId);
            }
        }
    }

    private assertNotAlreadyTeamed(eventId: number, userId: number): void {
        if (this.teamRepository.findTeamMembership(eventId, userId) !== undefined) {
            throw new UserAlreadyInTeamForEventError(userId);
        }
    }

    private requiredDraftMinimum(event: Event): number {
        const config = event.config;
        if (config?.minParticipants !== undefined) {
            return config.minParticipants;
        }
        const teamConfig = config?.teamConfig;
        return teamConfig !== undefined ? teamConfig.teamSize * teamConfig.teamCount : 0;
    }
}
