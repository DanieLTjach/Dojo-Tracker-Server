import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type {
    Team,
    TeamAvailablePlayerDTO,
    TeamMember,
    TeamMemberCountDTO,
    TeamRole,
    TeamStandingRowDTO,
} from '../model/TeamModels.ts';
import { parseTeamRole } from '../util/EnumUtil.ts';

const TEAM_SELECT_COLUMNS = `
    t.id as teamId,
    t.eventId,
    t.name,
    t.createdAt,
    t.modifiedAt,
    t.modifiedBy,
    tm.userId,
    tm.role,
    u.name as userName,
    p.firstName as profileFirstName,
    p.lastName as profileLastName,
    p.hideProfile as profileHidden
`;

const TEAM_FROM_JOIN = `
    FROM team t
    LEFT JOIN teamMembership tm ON tm.teamId = t.id
    LEFT JOIN user u ON u.id = tm.userId
    LEFT JOIN profile p ON p.userId = tm.userId
`;

const TEAM_ORDER_BY = `ORDER BY t.id, tm.createdAt`;

export class TeamRepository {
    private findTeamsByEventIdStatement(): Statement<{ eventId: number }, TeamRowDBEntity> {
        return dbManager.db.prepare(`
            SELECT ${TEAM_SELECT_COLUMNS}
            ${TEAM_FROM_JOIN}
            WHERE t.eventId = :eventId
            ${TEAM_ORDER_BY}
        `);
    }

    findTeamsByEventId(eventId: number): Team[] {
        return groupTeamRows(this.findTeamsByEventIdStatement().all({ eventId }));
    }

    private findTeamByIdStatement(): Statement<{ teamId: number }, TeamRowDBEntity> {
        return dbManager.db.prepare(`
            SELECT ${TEAM_SELECT_COLUMNS}
            ${TEAM_FROM_JOIN}
            WHERE t.id = :teamId
            ${TEAM_ORDER_BY}
        `);
    }

    findTeamById(teamId: number): Team | undefined {
        const teams = groupTeamRows(this.findTeamByIdStatement().all({ teamId }));
        return teams[0];
    }

    private createTeamStatement(): Statement<{
        eventId: number;
        name: string;
        createdAt: string;
        modifiedAt: string;
        modifiedBy: number;
    }, { id: number }> {
        return dbManager.db.prepare(`
            INSERT INTO team (eventId, name, createdAt, modifiedAt, modifiedBy)
            VALUES (:eventId, :name, :createdAt, :modifiedAt, :modifiedBy)
            RETURNING id
        `);
    }

    createTeam(eventId: number, name: string, createdAt: Date, modifiedBy: number): number {
        const isoNow = createdAt.toISOString();
        const result = this.createTeamStatement().get({
            eventId,
            name,
            createdAt: isoNow,
            modifiedAt: isoNow,
            modifiedBy,
        });
        return result!.id;
    }

    private updateTeamNameStatement(): Statement<{
        teamId: number;
        name: string;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            UPDATE team
            SET name = :name, modifiedAt = :modifiedAt, modifiedBy = :modifiedBy
            WHERE id = :teamId
        `);
    }

    updateTeamName(teamId: number, name: string, modifiedBy: number): void {
        this.updateTeamNameStatement().run({
            teamId,
            name,
            modifiedAt: new Date().toISOString(),
            modifiedBy,
        });
    }

    private deleteTeamStatement(): Statement<{ teamId: number }, void> {
        return dbManager.db.prepare(`DELETE FROM team WHERE id = :teamId`);
    }

    private deleteMembershipsByTeamIdStatement(): Statement<{ teamId: number }, void> {
        return dbManager.db.prepare(`DELETE FROM teamMembership WHERE teamId = :teamId`);
    }

    /** Deletes the team and its memberships (no ON DELETE CASCADE in this schema). */
    deleteTeam(teamId: number): void {
        this.deleteMembershipsByTeamIdStatement().run({ teamId });
        this.deleteTeamStatement().run({ teamId });
    }

    private addMemberStatement(): Statement<{
        teamId: number;
        eventId: number;
        userId: number;
        role: string;
        createdAt: string;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            INSERT INTO teamMembership (teamId, eventId, userId, role, createdAt, modifiedAt, modifiedBy)
            VALUES (:teamId, :eventId, :userId, :role, :createdAt, :modifiedAt, :modifiedBy)
        `);
    }

    addMember(teamId: number, eventId: number, userId: number, role: TeamRole, modifiedBy: number): void {
        const isoNow = new Date().toISOString();
        this.addMemberStatement().run({
            teamId,
            eventId,
            userId,
            role,
            createdAt: isoNow,
            modifiedAt: isoNow,
            modifiedBy,
        });
    }

    private removeMemberStatement(): Statement<{ teamId: number, userId: number }, void> {
        return dbManager.db.prepare(`DELETE FROM teamMembership WHERE teamId = :teamId AND userId = :userId`);
    }

    removeMember(teamId: number, userId: number): void {
        this.removeMemberStatement().run({ teamId, userId });
    }

    private findPlayerTeamMapStatement(): Statement<{ eventId: number }, { userId: number, teamId: number }> {
        return dbManager.db.prepare(`
            SELECT userId, teamId FROM teamMembership WHERE eventId = :eventId
        `);
    }

    /** userId -> teamId for every teamed player in the event. */
    findPlayerTeamMapForEvent(eventId: number): { userId: number, teamId: number }[] {
        return this.findPlayerTeamMapStatement().all({ eventId });
    }

    private findTeamMembershipStatement(): Statement<
        { eventId: number, userId: number },
        { teamId: number, role: string }
    > {
        return dbManager.db.prepare(`
            SELECT teamId, role FROM teamMembership WHERE eventId = :eventId AND userId = :userId
        `);
    }

    findTeamMembership(eventId: number, userId: number): { teamId: number, role: TeamRole } | undefined {
        const row = this.findTeamMembershipStatement().get({ eventId, userId });
        return row !== undefined ? { teamId: row.teamId, role: parseTeamRole(row.role) } : undefined;
    }

    private isCaptainOfTeamStatement(): Statement<{ teamId: number, userId: number }, { one: number }> {
        return dbManager.db.prepare(`
            SELECT 1 as one FROM teamMembership
            WHERE teamId = :teamId AND userId = :userId AND role = 'CAPTAIN'
        `);
    }

    isCaptainOfTeam(teamId: number, userId: number): boolean {
        return this.isCaptainOfTeamStatement().get({ teamId, userId }) !== undefined;
    }

    private countTeamsByEventIdStatement(): Statement<{ eventId: number }, { count: number }> {
        return dbManager.db.prepare(`SELECT COUNT(*) as count FROM team WHERE eventId = :eventId`);
    }

    countTeamsByEventId(eventId: number): number {
        return this.countTeamsByEventIdStatement().get({ eventId })!.count;
    }

    private countUnteamedApprovedPlayersStatement(): Statement<{ eventId: number }, { count: number }> {
        return dbManager.db.prepare(`
            SELECT COUNT(*) as count
            FROM eventRegistration er
            WHERE er.eventId = :eventId
              AND er.status = 'APPROVED'
              AND NOT EXISTS (
                  SELECT 1 FROM teamMembership tm
                  WHERE tm.eventId = er.eventId AND tm.userId = er.userId
              )
        `);
    }

    countUnteamedApprovedPlayers(eventId: number): number {
        return this.countUnteamedApprovedPlayersStatement().get({ eventId })!.count;
    }

    private findTeamMemberCountsStatement(): Statement<{ eventId: number }, TeamMemberCountDTO> {
        return dbManager.db.prepare(`
            SELECT t.id as teamId, COUNT(tm.userId) as memberCount
            FROM team t
            LEFT JOIN teamMembership tm ON tm.teamId = t.id
            WHERE t.eventId = :eventId
            GROUP BY t.id
            ORDER BY t.id
        `);
    }

    findTeamMemberCountsByEventId(eventId: number): TeamMemberCountDTO[] {
        return this.findTeamMemberCountsStatement().all({ eventId });
    }

    private findUnteamedApprovedPlayersStatement(): Statement<
        { eventId: number },
        TeamAvailablePlayerDBEntity
    > {
        return dbManager.db.prepare(`
            SELECT er.userId,
                   u.name,
                   p.firstName as profileFirstName,
                   p.lastName as profileLastName,
                   p.hideProfile as profileHidden
            FROM eventRegistration er
            JOIN user u ON u.id = er.userId
            LEFT JOIN profile p ON p.userId = er.userId
            WHERE er.eventId = :eventId
              AND er.status = 'APPROVED'
              AND NOT EXISTS (
                  SELECT 1 FROM teamMembership tm
                  WHERE tm.eventId = er.eventId AND tm.userId = er.userId
              )
            ORDER BY u.name
        `);
    }

    /** Approved registrations for the event that are not yet on any team (the draft pool). */
    findUnteamedApprovedPlayers(eventId: number): TeamAvailablePlayerDTO[] {
        return this.findUnteamedApprovedPlayersStatement()
            .all({ eventId })
            .map(teamAvailablePlayerFromDBEntity);
    }

    private findTeamStandingsStatement(): Statement<
        { eventId: number },
        TeamStandingRowDTO
    > {
        // teamRating stores the team's rating after each counted game. Current standings
        // are therefore the latest teamRating per team, with empty teams at 0.
        return dbManager.db.prepare(`
            SELECT t.id as teamId,
                   t.name as teamName,
                   COALESCE(latest.teamRating, 0) as totalTeamRating,
                   COALESCE(counts.gamesCounted, 0) as gamesCounted
            FROM team t
            LEFT JOIN (
                SELECT teamId, teamRating
                FROM (
                    SELECT teamId,
                           teamRating,
                           ROW_NUMBER() OVER (
                               PARTITION BY teamId
                               ORDER BY timestamp DESC, gameId DESC, userId DESC
                           ) as rn
                    FROM userRatingChange
                    WHERE eventId = :eventId AND teamId IS NOT NULL AND teamRating IS NOT NULL
                )
                WHERE rn = 1
            ) latest ON latest.teamId = t.id
            LEFT JOIN (
                SELECT teamId, COUNT(gameId) as gamesCounted
                FROM userRatingChange
                WHERE eventId = :eventId AND teamId IS NOT NULL AND teamRating IS NOT NULL
                GROUP BY teamId
            ) counts ON counts.teamId = t.id
            WHERE t.eventId = :eventId
            GROUP BY t.id, t.name
            ORDER BY totalTeamRating DESC, t.name
        `);
    }

    findTeamStandings(eventId: number): TeamStandingRowDTO[] {
        return this.findTeamStandingsStatement().all({ eventId });
    }
}

interface TeamAvailablePlayerDBEntity {
    userId: number;
    name: string;
    profileFirstName: string | null;
    profileLastName: string | null;
    profileHidden: number | null;
}

interface TeamRowDBEntity {
    teamId: number;
    eventId: number;
    name: string;
    createdAt: string;
    modifiedAt: string;
    modifiedBy: number;
    // member columns are null when a team has no members yet (LEFT JOIN)
    userId: number | null;
    role: string | null;
    userName: string | null;
    profileFirstName: string | null;
    profileLastName: string | null;
    profileHidden: number | null;
}

// Collapse the flat (team x member) join into Team objects with a members array,
// preserving the SQL ordering (captain first). A team with no members yields an
// empty members array rather than a phantom member.
function groupTeamRows(rows: TeamRowDBEntity[]): Team[] {
    const byId = new Map<number, Team>();
    for (const row of rows) {
        let team = byId.get(row.teamId);
        if (team === undefined) {
            team = {
                id: row.teamId,
                eventId: row.eventId,
                name: row.name,
                members: [],
                createdAt: new Date(row.createdAt),
                modifiedAt: new Date(row.modifiedAt),
                modifiedBy: row.modifiedBy,
            };
            byId.set(row.teamId, team);
        }
        if (row.userId !== null && row.role !== null) {
            const member: TeamMember = {
                userId: row.userId,
                name: row.userName ?? '',
                profileFirstName: row.profileHidden ? null : row.profileFirstName,
                profileLastName: row.profileHidden ? null : row.profileLastName,
                profileHidden: Boolean(row.profileHidden),
                role: parseTeamRole(row.role),
            };
            team.members.push(member);
        }
    }
    return [...byId.values()];
}

function teamAvailablePlayerFromDBEntity(dbEntity: TeamAvailablePlayerDBEntity): TeamAvailablePlayerDTO {
    const profileHidden = Boolean(dbEntity.profileHidden);
    return {
        userId: dbEntity.userId,
        name: dbEntity.name,
        profileFirstName: profileHidden ? null : dbEntity.profileFirstName,
        profileLastName: profileHidden ? null : dbEntity.profileLastName,
        profileHidden,
    };
}
