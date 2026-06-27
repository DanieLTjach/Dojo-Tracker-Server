import type { Statement } from 'better-sqlite3';
import { dbManager } from '../db/dbInit.ts';
import type { Team, TeamMember, TeamRole } from '../model/TeamModels.ts';
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
    p.lastName as profileLastName
`;

const TEAM_FROM_JOIN = `
    FROM team t
    LEFT JOIN teamMembership tm ON tm.teamId = t.id
    LEFT JOIN user u ON u.id = tm.userId
    LEFT JOIN profile p ON p.userId = tm.userId
`;

// CAPTAIN sorts before MEMBER, then by name, so members[0] is always the captain.
const TEAM_ORDER_BY = `ORDER BY t.id, CASE tm.role WHEN 'CAPTAIN' THEN 0 ELSE 1 END, u.name`;

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

    private setMemberRoleStatement(): Statement<{
        teamId: number;
        userId: number;
        role: string;
        modifiedAt: string;
        modifiedBy: number;
    }, void> {
        return dbManager.db.prepare(`
            UPDATE teamMembership
            SET role = :role, modifiedAt = :modifiedAt, modifiedBy = :modifiedBy
            WHERE teamId = :teamId AND userId = :userId
        `);
    }

    setMemberRole(teamId: number, userId: number, role: TeamRole, modifiedBy: number): void {
        this.setMemberRoleStatement().run({
            teamId,
            userId,
            role,
            modifiedAt: new Date().toISOString(),
            modifiedBy,
        });
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

    private findUnteamedApprovedPlayersStatement(): Statement<
        { eventId: number },
        { userId: number, name: string, profileFirstName: string | null, profileLastName: string | null }
    > {
        return dbManager.db.prepare(`
            SELECT er.userId, u.name, p.firstName as profileFirstName, p.lastName as profileLastName
            FROM eventRegistration er
            JOIN user u ON u.id = er.userId
            LEFT JOIN profile p ON p.userId = er.userId
            WHERE er.eventId = :eventId
              AND er.status = 'APPROVED'
              AND er.userId NOT IN (SELECT userId FROM teamMembership WHERE eventId = :eventId)
            ORDER BY u.name
        `);
    }

    /** Approved registrations for the event that are not yet on any team (the draft pool). */
    findUnteamedApprovedPlayers(
        eventId: number
    ): { userId: number, name: string, profileFirstName: string | null, profileLastName: string | null }[] {
        return this.findUnteamedApprovedPlayersStatement().all({ eventId });
    }
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
                profileFirstName: row.profileFirstName,
                profileLastName: row.profileLastName,
                role: parseTeamRole(row.role),
            };
            team.members.push(member);
        }
    }
    return [...byId.values()];
}
