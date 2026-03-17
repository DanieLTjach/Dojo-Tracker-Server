import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
    clubMembershipGetListSchema,
    clubMembershipGetPendingListSchema,
    clubMembershipRequestJoinSchema,
    clubMembershipActivateSchema,
    clubMembershipDeactivateSchema,
    clubMembershipUpdateSchema
} from '../schema/ClubSchemas.ts';
import { ClubMembershipService } from '../service/ClubMembershipService.ts';

export class ClubMembershipController {
    private membershipService: ClubMembershipService = new ClubMembershipService();

    getMembers(req: Request, res: Response) {
        const { params: { clubId } } = clubMembershipGetListSchema.parse(req);
        const members = this.membershipService.getMembers(clubId);
        return res.status(StatusCodes.OK).json(members);
    }

    getActiveMembers(req: Request, res: Response) {
        const { params: { clubId } } = clubMembershipGetListSchema.parse(req);
        const members = this.membershipService.getActiveMembersByClubId(clubId);
        return res.status(StatusCodes.OK).json(members);
    }

    getPendingMembers(req: Request, res: Response) {
        const { params: { clubId } } = clubMembershipGetPendingListSchema.parse(req);
        const members = this.membershipService.getPendingMembers(clubId);
        return res.status(StatusCodes.OK).json(members);
    }

    requestJoin(req: Request, res: Response) {
        const { params: { clubId } } = clubMembershipRequestJoinSchema.parse(req);
        const userId = req.user!.userId;
        const membership = this.membershipService.requestJoin(clubId, userId, userId);
        return res.status(StatusCodes.CREATED).json(membership);
    }

    leaveClub(req: Request, res: Response) {
        const { params: { clubId } } = clubMembershipRequestJoinSchema.parse(req);
        const userId = req.user!.userId;
        const membership = this.membershipService.leaveClub(clubId, userId);
        return res.status(StatusCodes.OK).json(membership);
    }

    activateMember(req: Request, res: Response) {
        const { params: { clubId, userId } } = clubMembershipActivateSchema.parse(req);
        const modifiedBy = req.user!.userId;
        const membership = this.membershipService.activateMember(clubId, userId, modifiedBy);
        return res.status(StatusCodes.OK).json(membership);
    }

    deactivateMember(req: Request, res: Response) {
        const { params: { clubId, userId } } = clubMembershipDeactivateSchema.parse(req);
        const modifiedBy = req.user!.userId;
        const membership = this.membershipService.deactivateMember(clubId, userId, modifiedBy);
        return res.status(StatusCodes.OK).json(membership);
    }

    updateMemberRole(req: Request, res: Response) {
        const { params: { clubId, userId }, body: { role } } = clubMembershipUpdateSchema.parse(req);
        const modifiedBy = req.user!.userId;
        const membership = this.membershipService.updateMemberRole(clubId, userId, role, modifiedBy);
        return res.status(StatusCodes.OK).json(membership);
    }
}
