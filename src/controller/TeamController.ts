import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
    startDraftSchema,
    teamAddMemberSchema,
    teamAvailablePlayersSchema,
    teamCreateSchema,
    teamDeleteSchema,
    teamGetSchema,
    teamListSchema,
    teamRemoveMemberSchema,
    teamRenameSchema,
} from '../schema/TeamSchemas.ts';
import { TeamService } from '../service/TeamService.ts';

export class TeamController {
    private teamService: TeamService = new TeamService();

    list(req: Request, res: Response) {
        const { params: { eventId } } = teamListSchema.parse(req);
        return res.status(StatusCodes.OK).json(this.teamService.listTeamsForEvent(eventId));
    }

    get(req: Request, res: Response) {
        const { params: { teamId } } = teamGetSchema.parse(req);
        return res.status(StatusCodes.OK).json(this.teamService.getTeam(teamId));
    }

    availablePlayers(req: Request, res: Response) {
        const { params: { eventId } } = teamAvailablePlayersSchema.parse(req);
        return res.status(StatusCodes.OK).json(this.teamService.getAvailablePlayers(eventId));
    }

    create(req: Request, res: Response) {
        const { params: { eventId }, body } = teamCreateSchema.parse(req);
        const actingUserId = req.user!.userId;
        const captainUserId = body.captainUserId ?? actingUserId;
        const team = this.teamService.createTeam(eventId, body.name, captainUserId, actingUserId);
        return res.status(StatusCodes.CREATED).json(team);
    }

    rename(req: Request, res: Response) {
        const { params: { eventId, teamId }, body } = teamRenameSchema.parse(req);
        const team = this.teamService.renameTeam(eventId, teamId, body.name, req.user!.userId);
        return res.status(StatusCodes.OK).json(team);
    }

    remove(req: Request, res: Response) {
        const { params: { eventId, teamId } } = teamDeleteSchema.parse(req);
        this.teamService.deleteTeam(eventId, teamId, req.user!.userId);
        return res.status(StatusCodes.NO_CONTENT).send();
    }

    addMember(req: Request, res: Response) {
        const { params: { eventId, teamId }, body } = teamAddMemberSchema.parse(req);
        const team = this.teamService.addMember(eventId, teamId, body.userId, req.user!.userId);
        return res.status(StatusCodes.OK).json(team);
    }

    removeMember(req: Request, res: Response) {
        const { params: { eventId, teamId, userId } } = teamRemoveMemberSchema.parse(req);
        const team = this.teamService.removeMember(eventId, teamId, userId, req.user!.userId);
        return res.status(StatusCodes.OK).json(team);
    }

    startDraft(req: Request, res: Response) {
        const { params: { eventId } } = startDraftSchema.parse(req);
        const event = this.teamService.startDraft(eventId, req.user!.userId);
        return res.status(StatusCodes.OK).json(event);
    }
}
