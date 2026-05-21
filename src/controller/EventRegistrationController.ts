import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
    eventRegistrationApplySchema,
    eventRegistrationApproveSchema,
    eventRegistrationEditProfileSchema,
    eventRegistrationListSchema,
    eventRegistrationManualSchema,
    eventRegistrationRejectSchema,
    eventRegistrationWithdrawSchema,
    myRegistrationsSchema
} from '../schema/EventRegistrationSchemas.ts';
import { EventRegistrationService } from '../service/EventRegistrationService.ts';

export class EventRegistrationController {
    private registrationService: EventRegistrationService = new EventRegistrationService();

    apply(req: Request, res: Response) {
        const { params: { eventId } } = eventRegistrationApplySchema.parse(req);
        const userId = req.user!.userId;
        const registration = this.registrationService.apply(eventId, userId);
        return res.status(StatusCodes.CREATED).json(registration);
    }

    withdraw(req: Request, res: Response) {
        const { params: { eventId } } = eventRegistrationWithdrawSchema.parse(req);
        const userId = req.user!.userId;
        this.registrationService.withdraw(eventId, userId);
        return res.status(StatusCodes.NO_CONTENT).send();
    }

    listForEvent(req: Request, res: Response) {
        const { params: { eventId }, query } = eventRegistrationListSchema.parse(req);
        const registrations = this.registrationService.getRegistrationsForEvent(eventId, query?.status);
        return res.status(StatusCodes.OK).json(registrations);
    }

    approve(req: Request, res: Response) {
        const { params: { eventId, userId } } = eventRegistrationApproveSchema.parse(req);
        const modifierId = req.user!.userId;
        const registration = this.registrationService.approve(eventId, userId, modifierId);
        return res.status(StatusCodes.OK).json(registration);
    }

    reject(req: Request, res: Response) {
        const { params: { eventId, userId } } = eventRegistrationRejectSchema.parse(req);
        const modifierId = req.user!.userId;
        const registration = this.registrationService.reject(eventId, userId, modifierId);
        return res.status(StatusCodes.OK).json(registration);
    }

    manualRegister(req: Request, res: Response) {
        const { params: { eventId, userId }, body } = eventRegistrationManualSchema.parse(req);
        const modifierId = req.user!.userId;
        const profileNames = body?.firstName !== undefined && body?.lastName !== undefined
            ? { firstName: body.firstName, lastName: body.lastName }
            : undefined;
        const registration = this.registrationService.manualRegister(eventId, userId, modifierId, profileNames);
        return res.status(StatusCodes.OK).json(registration);
    }

    editParticipantProfileNames(req: Request, res: Response) {
        const {
            params: { eventId, userId },
            body: { firstName, lastName }
        } = eventRegistrationEditProfileSchema.parse(req);
        const modifierId = req.user!.userId;
        const profile = this.registrationService.editParticipantProfileNames(eventId, userId, firstName, lastName, modifierId);
        return res.status(StatusCodes.OK).json(profile);
    }

    listForCurrentUser(req: Request, res: Response) {
        const { query } = myRegistrationsSchema.parse(req);
        const userId = req.user!.userId;
        const registrations = this.registrationService.getRegistrationsForUser(userId, query?.status);
        return res.status(StatusCodes.OK).json(registrations);
    }
}
