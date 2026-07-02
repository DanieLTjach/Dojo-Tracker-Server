import { dbManager } from '../src/db/dbInit.ts';
import { cleanupTestDatabase } from './setup.ts';
import { TeamService } from '../src/service/TeamService.ts';
import { RatingService } from '../src/service/RatingService.ts';
import { RatingRepository } from '../src/repository/RatingRepository.ts';
import { EventService } from '../src/service/EventService.ts';
import { TournamentStatus } from '../src/model/TournamentModels.ts';
import type { GameRules } from '../src/model/EventModels.ts';
import { InsufficientClubPermissionsError } from '../src/error/ClubErrors.ts';
import {
    InsufficientTeamPermissionsError,
    NotEnoughApprovedForDraftError,
    DraftNotStartableError,
    TeamCountMustBeDivisibleByFourError,
    TeamCompositionLockedError,
    TeamCountLimitReachedError,
    TeamDraftHasUnteamedPlayersError,
    TeamDraftUnevenTeamsError,
    TeamFullError,
    TeamMemberNotFoundError,
    TeamsNotAllowedForFormatError,
    UserAlreadyInTeamForEventError,
    UserNotApprovedParticipantError,
} from '../src/error/TeamErrors.ts';

const SYSTEM_USER_ID = 0;

describe('TeamService', () => {
    const service = new TeamService();
    const eventService = new EventService();

    const CLUB_ID = 97100;
    const OWNER_ID = 97201;
    const CAPTAIN_A = 97202;
    const CAPTAIN_B = 97203;
    const PLAYER_1 = 97204;
    const PLAYER_2 = 97205;
    const OUTSIDER = 97206; // approved nowhere
    const PENDING_PLAYER = 97207;

    const TEAM_TOURNAMENT_ID = 97300; // format TEAM, teamConfig {2,4}, minParticipants 8
    const INDIVIDUAL_TOURNAMENT_ID = 97301; // format INDIVIDUAL
    const GAME_RULES_ID = 97400;

    let ts = 0;
    function nextTs(): string {
        ts += 1;
        return new Date(Date.parse('2026-04-01T00:00:00.000Z') + ts).toISOString();
    }

    function insertUser(userId: number, name: string): void {
        const t = nextTs();
        dbManager.db.prepare(
            `INSERT INTO user (id, name, telegramUsername, telegramId, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, NULL, NULL, 0, 1, 'ACTIVE', ?, ?, ?)`
        ).run(userId, name, t, t, SYSTEM_USER_ID);
    }

    function approve(eventId: number, userId: number, status: 'APPROVED' | 'PENDING' = 'APPROVED'): void {
        const t = nextTs();
        dbManager.db.prepare(
            `INSERT INTO eventRegistration (eventId, userId, status, isFillerPlayer, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, ?, 0, ?, ?, ?)`
        ).run(eventId, userId, status, t, t, SYSTEM_USER_ID);
    }

    function setTournamentStatus(eventId: number, status: string): void {
        dbManager.db.prepare('UPDATE tournament SET status = ? WHERE eventId = ?').run(status, eventId);
    }

    function moveTeamTournamentToDraft(): void {
        setTournamentStatus(TEAM_TOURNAMENT_ID, 'DRAFT');
    }

    beforeAll(() => {
        for (
            const [id, name] of [
                [OWNER_ID, 'Owner'],
                [CAPTAIN_A, 'Captain A'],
                [CAPTAIN_B, 'Captain B'],
                [PLAYER_1, 'Player 1'],
                [PLAYER_2, 'Player 2'],
                [OUTSIDER, 'Outsider'],
                [PENDING_PLAYER, 'Pending'],
            ] as const
        ) {
            insertUser(id, name);
        }

        const t = nextTs();
        dbManager.db.prepare(
            `INSERT INTO club (id, name, isActive, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Team Club', 1, ?, ?, ?)`
        ).run(CLUB_ID, t, t, SYSTEM_USER_ID);
        dbManager.db.prepare(
            `INSERT INTO clubMembership (clubId, userId, role, status, createdAt, modifiedAt, modifiedBy)
             VALUES (?, ?, 'OWNER', 'ACTIVE', ?, ?, ?)`
        ).run(CLUB_ID, OWNER_ID, t, t, SYSTEM_USER_ID);

        dbManager.db.prepare(
            `INSERT INTO gameRules (id, name, numberOfPlayers, uma, startingPoints, clubId)
             VALUES (?, 'Team Rules', 4, '[15,5,-5,-15]', 30000, ?)`
        ).run(GAME_RULES_ID, CLUB_ID);

        // Team tournament: teamSize 2, teamCount 4, minParticipants 8.
        dbManager.db.prepare(
            `INSERT INTO event (id, name, type, format, gameRules, clubId, startingRating, minimumGamesForRating, config, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Team Tournament', 'TOURNAMENT', 'TEAM', ?, ?, 0, 0, ?, ?, ?, ?)`
        ).run(
            TEAM_TOURNAMENT_ID,
            GAME_RULES_ID,
            CLUB_ID,
            JSON.stringify({ minParticipants: 8, teamConfig: { teamSize: 2, teamCount: 4 } }),
            nextTs(),
            nextTs(),
            SYSTEM_USER_ID
        );
        dbManager.db.prepare(
            `INSERT INTO tournament (eventId, status, totalRounds, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'CREATED', 3, ?, ?, ?)`
        ).run(TEAM_TOURNAMENT_ID, nextTs(), nextTs(), SYSTEM_USER_ID);

        dbManager.db.prepare(
            `INSERT INTO event (id, name, type, format, gameRules, clubId, startingRating, minimumGamesForRating, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'Individual Tournament', 'TOURNAMENT', 'INDIVIDUAL', ?, ?, 0, 0, ?, ?, ?)`
        ).run(INDIVIDUAL_TOURNAMENT_ID, GAME_RULES_ID, CLUB_ID, nextTs(), nextTs(), SYSTEM_USER_ID);
        dbManager.db.prepare(
            `INSERT INTO tournament (eventId, status, totalRounds, createdAt, modifiedAt, modifiedBy)
             VALUES (?, 'CREATED', 3, ?, ?, ?)`
        ).run(INDIVIDUAL_TOURNAMENT_ID, nextTs(), nextTs(), SYSTEM_USER_ID);

        // All non-pending players are approved for the team tournament.
        for (const id of [CAPTAIN_A, CAPTAIN_B, PLAYER_1, PLAYER_2]) {
            approve(TEAM_TOURNAMENT_ID, id);
        }
        approve(TEAM_TOURNAMENT_ID, PENDING_PLAYER, 'PENDING');
    });

    afterAll(() => {
        dbManager.db.prepare('DELETE FROM teamMembership WHERE eventId IN (?, ?)').run(
            TEAM_TOURNAMENT_ID,
            INDIVIDUAL_TOURNAMENT_ID
        );
        dbManager.db.prepare('DELETE FROM team WHERE eventId IN (?, ?)').run(
            TEAM_TOURNAMENT_ID,
            INDIVIDUAL_TOURNAMENT_ID
        );
        dbManager.db.prepare('DELETE FROM eventRegistration WHERE eventId IN (?, ?)').run(
            TEAM_TOURNAMENT_ID,
            INDIVIDUAL_TOURNAMENT_ID
        );
        dbManager.db.prepare('DELETE FROM tournament WHERE eventId IN (?, ?)').run(
            TEAM_TOURNAMENT_ID,
            INDIVIDUAL_TOURNAMENT_ID
        );
        dbManager.db.prepare('DELETE FROM event WHERE id IN (?, ?)').run(
            TEAM_TOURNAMENT_ID,
            INDIVIDUAL_TOURNAMENT_ID
        );
        dbManager.db.prepare('DELETE FROM gameRules WHERE id = ?').run(GAME_RULES_ID);
        dbManager.db.prepare('DELETE FROM clubMembership WHERE clubId = ?').run(CLUB_ID);
        dbManager.db.prepare('DELETE FROM club WHERE id = ?').run(CLUB_ID);
        dbManager.db.prepare('DELETE FROM user WHERE id >= 97200 AND id < 97300').run();
        dbManager.closeDB();
        cleanupTestDatabase();
    });

    afterEach(() => {
        dbManager.db.prepare('DELETE FROM teamMembership WHERE eventId IN (?, ?)').run(
            TEAM_TOURNAMENT_ID,
            INDIVIDUAL_TOURNAMENT_ID
        );
        dbManager.db.prepare('DELETE FROM team WHERE eventId IN (?, ?)').run(
            TEAM_TOURNAMENT_ID,
            INDIVIDUAL_TOURNAMENT_ID
        );
        dbManager.db.prepare('DELETE FROM profile WHERE userId IN (?, ?, ?, ?, ?, ?, ?)').run(
            OWNER_ID,
            CAPTAIN_A,
            CAPTAIN_B,
            PLAYER_1,
            PLAYER_2,
            OUTSIDER,
            PENDING_PLAYER
        );
        dbManager.db.prepare('DELETE FROM eventRegistration WHERE eventId = ? AND userId = ?')
            .run(TEAM_TOURNAMENT_ID, OUTSIDER);
        dbManager.db.prepare('UPDATE eventRegistration SET status = ? WHERE eventId = ? AND userId = ?')
            .run('PENDING', TEAM_TOURNAMENT_ID, PENDING_PLAYER);
        setTournamentStatus(TEAM_TOURNAMENT_ID, 'CREATED');
    });

    describe('createTeam', () => {
        beforeEach(moveTeamTournamentToDraft);

        it('lets a captain create their own team and become CAPTAIN', () => {
            const team = service.createTeam(TEAM_TOURNAMENT_ID, 'Dragons', CAPTAIN_A, CAPTAIN_A);
            expect(team.name).toBe('Dragons');
            expect(team.members).toHaveLength(1);
            expect(team.members[0]).toMatchObject({ userId: CAPTAIN_A, role: 'CAPTAIN' });
        });

        it('lets a club manager create a team for another captain', () => {
            const team = service.createTeam(TEAM_TOURNAMENT_ID, 'Tigers', CAPTAIN_A, OWNER_ID);
            expect(team.members[0]).toMatchObject({ userId: CAPTAIN_A, role: 'CAPTAIN' });
        });

        it('forbids creating a team with someone else as captain when not a manager', () => {
            expect(() => service.createTeam(TEAM_TOURNAMENT_ID, 'X', CAPTAIN_B, CAPTAIN_A))
                .toThrow(InsufficientTeamPermissionsError);
        });

        it('rejects teams on an individual tournament', () => {
            expect(() => service.createTeam(INDIVIDUAL_TOURNAMENT_ID, 'X', OWNER_ID, OWNER_ID))
                .toThrow(TeamsNotAllowedForFormatError);
        });

        it('rejects a captain who is not an approved participant', () => {
            expect(() => service.createTeam(TEAM_TOURNAMENT_ID, 'X', OUTSIDER, OUTSIDER))
                .toThrow(UserNotApprovedParticipantError);
        });

        it('rejects a player already on a team for this event', () => {
            service.createTeam(TEAM_TOURNAMENT_ID, 'Dragons', CAPTAIN_A, CAPTAIN_A);
            expect(() => service.createTeam(TEAM_TOURNAMENT_ID, 'Other', CAPTAIN_A, OWNER_ID))
                .toThrow(UserAlreadyInTeamForEventError);
        });

        it('enforces the team count cap from teamConfig.teamCount', () => {
            // teamCount is 4; create 4 teams with the four approved+unteamed players.
            for (const id of [CAPTAIN_A, CAPTAIN_B, PLAYER_1, PLAYER_2]) {
                service.createTeam(TEAM_TOURNAMENT_ID, `T-${id}`, id, OWNER_ID);
            }
            // A fifth team needs a fifth approved+unteamed captain. Promote the
            // PENDING player to APPROVED via UPDATE (it already has a registration row).
            dbManager.db.prepare('UPDATE eventRegistration SET status = ? WHERE eventId = ? AND userId = ?')
                .run('APPROVED', TEAM_TOURNAMENT_ID, PENDING_PLAYER);
            expect(() => service.createTeam(TEAM_TOURNAMENT_ID, 'Fifth', PENDING_PLAYER, OWNER_ID))
                .toThrow(TeamCountLimitReachedError);
            // Restore PENDING for other tests.
            dbManager.db.prepare('UPDATE eventRegistration SET status = ? WHERE eventId = ? AND userId = ?')
                .run('PENDING', TEAM_TOURNAMENT_ID, PENDING_PLAYER);
        });
    });

    describe('members', () => {
        beforeEach(moveTeamTournamentToDraft);

        it('adds a member up to teamSize and then rejects', () => {
            const team = service.createTeam(TEAM_TOURNAMENT_ID, 'Dragons', CAPTAIN_A, CAPTAIN_A);
            const withMember = service.addMember(TEAM_TOURNAMENT_ID, team.id, PLAYER_1, CAPTAIN_A);
            expect(withMember.members).toHaveLength(2); // teamSize 2 reached
            expect(() => service.addMember(TEAM_TOURNAMENT_ID, team.id, PLAYER_2, CAPTAIN_A))
                .toThrow(TeamFullError);
        });

        it('lets a captain remove their own member but forbids another captain', () => {
            const teamA = service.createTeam(TEAM_TOURNAMENT_ID, 'A', CAPTAIN_A, CAPTAIN_A);
            service.addMember(TEAM_TOURNAMENT_ID, teamA.id, PLAYER_1, CAPTAIN_A);
            // CAPTAIN_B is not the captain of teamA.
            expect(() => service.removeMember(TEAM_TOURNAMENT_ID, teamA.id, PLAYER_1, CAPTAIN_B))
                .toThrow(InsufficientTeamPermissionsError);
            const after = service.removeMember(TEAM_TOURNAMENT_ID, teamA.id, PLAYER_1, CAPTAIN_A);
            expect(after.members.map(m => m.userId)).not.toContain(PLAYER_1);
        });

        it('available players excludes already-teamed approved players', () => {
            const teamA = service.createTeam(TEAM_TOURNAMENT_ID, 'A', CAPTAIN_A, CAPTAIN_A);
            service.addMember(TEAM_TOURNAMENT_ID, teamA.id, PLAYER_1, CAPTAIN_A);
            const available = service.getAvailablePlayers(TEAM_TOURNAMENT_ID).map(p => p.userId);
            expect(available).toContain(CAPTAIN_B);
            expect(available).toContain(PLAYER_2);
            expect(available).not.toContain(CAPTAIN_A);
            expect(available).not.toContain(PLAYER_1);
        });

        it('hides native profile names when hideProfile is true', () => {
            const t = nextTs();
            dbManager.db.prepare(
                `INSERT INTO profile (userId, firstName, lastName, hideProfile, modifiedAt, modifiedBy)
                 VALUES (?, 'Secret', 'Captain', 1, ?, ?), (?, 'Visible', 'Player', 0, ?, ?)`
            ).run(CAPTAIN_A, t, SYSTEM_USER_ID, PLAYER_1, t, SYSTEM_USER_ID);

            const team = service.createTeam(TEAM_TOURNAMENT_ID, 'Hidden', CAPTAIN_A, CAPTAIN_A);
            expect(team.members[0]).toMatchObject({
                userId: CAPTAIN_A,
                profileFirstName: null,
                profileLastName: null,
                profileHidden: true,
            });

            const availablePlayer = service.getAvailablePlayers(TEAM_TOURNAMENT_ID)
                .find(player => player.userId === PLAYER_1);
            expect(availablePlayer).toMatchObject({
                profileFirstName: 'Visible',
                profileLastName: 'Player',
                profileHidden: false,
            });
        });
    });

    describe('setCaptain', () => {
        beforeEach(moveTeamTournamentToDraft);

        it('promotes a member to captain and demotes the previous captain', () => {
            const team = service.createTeam(TEAM_TOURNAMENT_ID, 'Dragons', CAPTAIN_A, CAPTAIN_A);
            service.addMember(TEAM_TOURNAMENT_ID, team.id, PLAYER_1, CAPTAIN_A);

            const updated = service.setCaptain(TEAM_TOURNAMENT_ID, team.id, PLAYER_1, OWNER_ID);
            const roleOf = (userId: number) => updated.members.find(m => m.userId === userId)?.role;
            expect(roleOf(PLAYER_1)).toBe('CAPTAIN');
            expect(roleOf(CAPTAIN_A)).toBe('MEMBER');
        });

        it('is idempotent when the user is already captain', () => {
            const team = service.createTeam(TEAM_TOURNAMENT_ID, 'Dragons', CAPTAIN_A, CAPTAIN_A);
            const updated = service.setCaptain(TEAM_TOURNAMENT_ID, team.id, CAPTAIN_A, OWNER_ID);
            expect(updated.members.find(m => m.userId === CAPTAIN_A)?.role).toBe('CAPTAIN');
        });

        it('rejects promoting a user who is not on the team', () => {
            const team = service.createTeam(TEAM_TOURNAMENT_ID, 'Dragons', CAPTAIN_A, CAPTAIN_A);
            expect(() => service.setCaptain(TEAM_TOURNAMENT_ID, team.id, PLAYER_2, OWNER_ID))
                .toThrow(TeamMemberNotFoundError);
        });

        it('forbids a captain of another team from reassigning', () => {
            const teamA = service.createTeam(TEAM_TOURNAMENT_ID, 'A', CAPTAIN_A, CAPTAIN_A);
            service.addMember(TEAM_TOURNAMENT_ID, teamA.id, PLAYER_1, CAPTAIN_A);
            expect(() => service.setCaptain(TEAM_TOURNAMENT_ID, teamA.id, PLAYER_1, CAPTAIN_B))
                .toThrow(InsufficientTeamPermissionsError);
        });
    });

    describe('captain removal', () => {
        beforeEach(moveTeamTournamentToDraft);

        it('lets a manager remove the captain to freely restructure in draft', () => {
            const team = service.createTeam(TEAM_TOURNAMENT_ID, 'Dragons', CAPTAIN_A, CAPTAIN_A);
            const after = service.removeMember(TEAM_TOURNAMENT_ID, team.id, CAPTAIN_A, OWNER_ID);
            expect(after.members.map(m => m.userId)).not.toContain(CAPTAIN_A);
            // Freed player becomes available again.
            expect(service.getAvailablePlayers(TEAM_TOURNAMENT_ID).map(p => p.userId)).toContain(CAPTAIN_A);
        });
    });

    describe('startDraft', () => {
        it('moves a team tournament from CREATED to DRAFT once minParticipants approved', () => {
            // 4 approved (< 8 min) -> should fail.
            expect(() => eventService.startDraft(TEAM_TOURNAMENT_ID, OWNER_ID))
                .toThrow(NotEnoughApprovedForDraftError);

            // Approve up to 8.
            for (const id of [OUTSIDER, PENDING_PLAYER]) {
                dbManager.db.prepare(
                    `INSERT INTO eventRegistration (eventId, userId, status, isFillerPlayer, createdAt, modifiedAt, modifiedBy)
                     VALUES (?, ?, 'APPROVED', 0, ?, ?, ?)
                     ON CONFLICT(eventId, userId) DO UPDATE SET status='APPROVED'`
                ).run(TEAM_TOURNAMENT_ID, id, nextTs(), nextTs(), SYSTEM_USER_ID);
            }
            insertExtraApproved();

            const event = eventService.startDraft(TEAM_TOURNAMENT_ID, OWNER_ID);
            expect(event.tournament!.status).toBe(TournamentStatus.DRAFT);

            cleanupExtraApproved();
        });

        it('forbids non-managers from starting the draft', () => {
            expect(() => eventService.startDraft(TEAM_TOURNAMENT_ID, CAPTAIN_A))
                .toThrow(InsufficientClubPermissionsError);
        });

        it('rejects starting the draft when not in CREATED', () => {
            setTournamentStatus(TEAM_TOURNAMENT_ID, 'IN_PROGRESS');
            expect(() => eventService.startDraft(TEAM_TOURNAMENT_ID, OWNER_ID))
                .toThrow(DraftNotStartableError);
        });
    });

    describe('composition lock', () => {
        beforeEach(moveTeamTournamentToDraft);

        it('blocks team changes while registration is still CREATED', () => {
            const team = service.createTeam(TEAM_TOURNAMENT_ID, 'A', CAPTAIN_A, CAPTAIN_A);
            setTournamentStatus(TEAM_TOURNAMENT_ID, 'CREATED');
            expect(() => service.addMember(TEAM_TOURNAMENT_ID, team.id, PLAYER_1, OWNER_ID))
                .toThrow(TeamCompositionLockedError);
        });

        it('blocks team changes once the tournament is in progress', () => {
            const team = service.createTeam(TEAM_TOURNAMENT_ID, 'A', CAPTAIN_A, CAPTAIN_A);
            setTournamentStatus(TEAM_TOURNAMENT_ID, 'IN_PROGRESS');
            expect(() => service.addMember(TEAM_TOURNAMENT_ID, team.id, PLAYER_1, OWNER_ID))
                .toThrow(TeamCompositionLockedError);
        });
    });

    describe('team tournament composition validation', () => {
        beforeEach(moveTeamTournamentToDraft);

        it('rejects a team tournament with approved players who are not on a team', () => {
            const event = eventService.getEventById(TEAM_TOURNAMENT_ID);
            expect(() => eventService.validateTeamTournamentComposition(event, true))
                .toThrow(TeamDraftHasUnteamedPlayersError);
        });

        it('rejects teams with uneven member counts before starting round 1', () => {
            const teamA = service.createTeam(TEAM_TOURNAMENT_ID, 'A', CAPTAIN_A, CAPTAIN_A);
            service.addMember(TEAM_TOURNAMENT_ID, teamA.id, PLAYER_1, CAPTAIN_A);
            service.createTeam(TEAM_TOURNAMENT_ID, 'B', CAPTAIN_B, CAPTAIN_B);
            service.createTeam(TEAM_TOURNAMENT_ID, 'C', PLAYER_2, OWNER_ID);

            const event = eventService.getEventById(TEAM_TOURNAMENT_ID);
            expect(() => eventService.validateTeamTournamentComposition(event, false))
                .toThrow(TeamDraftUnevenTeamsError);
        });

        it('requires the team count to be divisible by 4 for seating generation', () => {
            const teamA = service.createTeam(TEAM_TOURNAMENT_ID, 'A', CAPTAIN_A, CAPTAIN_A);
            service.addMember(TEAM_TOURNAMENT_ID, teamA.id, PLAYER_1, CAPTAIN_A);
            const teamB = service.createTeam(TEAM_TOURNAMENT_ID, 'B', CAPTAIN_B, CAPTAIN_B);
            service.addMember(TEAM_TOURNAMENT_ID, teamB.id, PLAYER_2, CAPTAIN_B);

            const event = eventService.getEventById(TEAM_TOURNAMENT_ID);
            expect(() => eventService.validateTeamTournamentComposition(event, true))
                .toThrow(TeamCountMustBeDivisibleByFourError);
        });
    });

    describe('getTeamStandings', () => {
        beforeEach(moveTeamTournamentToDraft);

        function insertGame(gameId: number): void {
            const t = nextTs();
            dbManager.db.prepare(
                `INSERT INTO game (id, eventId, createdAt, modifiedAt, modifiedBy, status, lastRoundWasDeleted)
                 VALUES (?, ?, ?, ?, ?, 'FINISHED', 0)`
            ).run(gameId, TEAM_TOURNAMENT_ID, t, t, SYSTEM_USER_ID);
        }
        function insertRatingChange(
            userId: number,
            gameId: number,
            teamId: number,
            ratingChange: number,
            teamRating: number
        ): void {
            dbManager.db.prepare(
                `INSERT INTO userRatingChange (userId, eventId, gameId, ratingChange, rating, timestamp, teamId, teamRating)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(userId, TEAM_TOURNAMENT_ID, gameId, ratingChange, teamRating, nextTs(), teamId, teamRating);
        }

        afterEach(() => {
            dbManager.db.prepare('DELETE FROM userRatingChange WHERE eventId = ?').run(TEAM_TOURNAMENT_ID);
            dbManager.db.prepare('DELETE FROM game WHERE eventId = ?').run(TEAM_TOURNAMENT_ID);
        });

        it('uses the latest teamRating per team, normalizes, and assigns places', () => {
            const teamA = service.createTeam(TEAM_TOURNAMENT_ID, 'Alpha', CAPTAIN_A, CAPTAIN_A);
            service.addMember(TEAM_TOURNAMENT_ID, teamA.id, PLAYER_1, CAPTAIN_A);
            const teamB = service.createTeam(TEAM_TOURNAMENT_ID, 'Beta', CAPTAIN_B, CAPTAIN_B);
            service.addMember(TEAM_TOURNAMENT_ID, teamB.id, PLAYER_2, CAPTAIN_B);

            insertGame(98001);
            // Team A latest current rating is 30000 raw => 30.0 normalized.
            insertRatingChange(CAPTAIN_A, 98001, teamA.id, 23000, 23000);
            insertRatingChange(PLAYER_1, 98001, teamA.id, 7000, 30000);
            // Team B latest current rating is -40000 raw => -40.0.
            insertRatingChange(CAPTAIN_B, 98001, teamB.id, -10000, -10000);
            insertRatingChange(PLAYER_2, 98001, teamB.id, -30000, -40000);

            const standings = service.getTeamStandings(TEAM_TOURNAMENT_ID);
            expect(standings).toEqual([
                { team: { id: teamA.id, name: 'Alpha' }, totalTeamRating: 30, gamesCounted: 2, place: 1 },
                { team: { id: teamB.id, name: 'Beta' }, totalTeamRating: -40, gamesCounted: 2, place: 2 },
            ]);
        });

        it('returns empty teams at 0 and lets equal totals share a place', () => {
            service.createTeam(TEAM_TOURNAMENT_ID, 'Alpha', CAPTAIN_A, CAPTAIN_A);
            service.createTeam(TEAM_TOURNAMENT_ID, 'Beta', CAPTAIN_B, CAPTAIN_B);

            const standings = service.getTeamStandings(TEAM_TOURNAMENT_ID);
            expect(standings).toHaveLength(2);
            expect(standings.every(s => s.totalTeamRating === 0 && s.gamesCounted === 0)).toBe(true);
            // Equal totals share place 1.
            expect(standings.map(s => s.place)).toEqual([1, 1]);
        });
    });

    describe('rating attribution (addRatingChangesFromGame)', () => {
        beforeEach(moveTeamTournamentToDraft);

        const ratingService = new RatingService();
        const ratingRepo = new RatingRepository();

        const gameRules: GameRules = {
            id: GAME_RULES_ID,
            name: 'Team Rules',
            clubId: CLUB_ID,
            numberOfPlayers: 4,
            uma: [15, 5, -5, -15],
            startingPoints: 30000,
            umaTieBreak: 'DIVIDE',
            details: null,
        };

        afterEach(() => {
            dbManager.db.prepare('DELETE FROM userRatingChange WHERE eventId = ?').run(TEAM_TOURNAMENT_ID);
            dbManager.db.prepare('DELETE FROM game WHERE eventId = ?').run(TEAM_TOURNAMENT_ID);
        });

        it('freezes teamId and current teamRating for teamed players', () => {
            // Two teams, one player each drafted, all four seated (the other two unteamed).
            const teamA = service.createTeam(TEAM_TOURNAMENT_ID, 'Alpha', CAPTAIN_A, CAPTAIN_A);
            const teamB = service.createTeam(TEAM_TOURNAMENT_ID, 'Beta', CAPTAIN_B, CAPTAIN_B);

            const t = nextTs();
            dbManager.db.prepare(
                `INSERT INTO game (id, eventId, createdAt, modifiedAt, modifiedBy, status, lastRoundWasDeleted)
                 VALUES (?, ?, ?, ?, ?, 'FINISHED', 0)`
            ).run(98100, TEAM_TOURNAMENT_ID, t, t, SYSTEM_USER_ID);

            ratingService.addRatingChangesFromGame(
                98100,
                new Date(t),
                [
                    { userId: CAPTAIN_A, points: 40000 },
                    { userId: CAPTAIN_B, points: 30000 },
                    { userId: PLAYER_1, points: 20000 }, // unteamed in this test
                    { userId: PLAYER_2, points: 10000 }, // unteamed in this test
                ],
                TEAM_TOURNAMENT_ID,
                gameRules,
                0
            );

            const captainAChange = ratingRepo.findUserRatingChangeInGame(CAPTAIN_A, 98100)!;
            expect(captainAChange.teamId).toBe(teamA.id);
            expect(captainAChange.teamRating).toBe(captainAChange.ratingChange);

            const captainBChange = ratingRepo.findUserRatingChangeInGame(CAPTAIN_B, 98100)!;
            expect(captainBChange.teamId).toBe(teamB.id);
            expect(captainBChange.teamRating).toBe(captainBChange.ratingChange);

            // Unteamed players have null attribution.
            const player1Change = ratingRepo.findUserRatingChangeInGame(PLAYER_1, 98100)!;
            expect(player1Change.teamId).toBeNull();
            expect(player1Change.teamRating).toBeNull();

            const secondTimestamp = nextTs();
            dbManager.db.prepare(
                `INSERT INTO game (id, eventId, createdAt, modifiedAt, modifiedBy, status, lastRoundWasDeleted)
                 VALUES (?, ?, ?, ?, ?, 'FINISHED', 0)`
            ).run(98101, TEAM_TOURNAMENT_ID, secondTimestamp, secondTimestamp, SYSTEM_USER_ID);

            ratingService.addRatingChangesFromGame(
                98101,
                new Date(secondTimestamp),
                [
                    { userId: CAPTAIN_A, points: 35000 },
                    { userId: CAPTAIN_B, points: 25000 },
                    { userId: PLAYER_1, points: 25000 },
                    { userId: PLAYER_2, points: 15000 },
                ],
                TEAM_TOURNAMENT_ID,
                gameRules,
                0
            );

            const secondCaptainAChange = ratingRepo.findUserRatingChangeInGame(CAPTAIN_A, 98101)!;
            expect(secondCaptainAChange.teamRating).toBe(
                captainAChange.teamRating! + secondCaptainAChange.ratingChange
            );
        });
    });

    // Helpers to push approved count to >= 8 for the draft test using throwaway users.
    const EXTRA_IDS = [97250, 97251, 97252];
    function insertExtraApproved(): void {
        for (const id of EXTRA_IDS) {
            const t = nextTs();
            dbManager.db.prepare(
                `INSERT INTO user (id, name, isAdmin, isActive, status, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, 0, 1, 'ACTIVE', ?, ?, ?)`
            ).run(id, `Extra ${id}`, t, t, SYSTEM_USER_ID);
            dbManager.db.prepare(
                `INSERT INTO eventRegistration (eventId, userId, status, isFillerPlayer, createdAt, modifiedAt, modifiedBy)
                 VALUES (?, ?, 'APPROVED', 0, ?, ?, ?)`
            ).run(TEAM_TOURNAMENT_ID, id, t, t, SYSTEM_USER_ID);
        }
    }
    function cleanupExtraApproved(): void {
        dbManager.db.prepare(`DELETE FROM eventRegistration WHERE eventId = ? AND userId IN (${EXTRA_IDS.join(',')})`)
            .run(TEAM_TOURNAMENT_ID);
        dbManager.db.prepare(`DELETE FROM user WHERE id IN (${EXTRA_IDS.join(',')})`).run();
    }
});
