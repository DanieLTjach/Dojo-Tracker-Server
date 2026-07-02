import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
    usageAccountUpdateSchema,
    usageAdjustmentSchema,
    usageSummarySchema,
} from '../schema/UsageSchemas.ts';
import { UsageService } from '../service/UsageService.ts';
import { ClubService } from '../service/ClubService.ts';

export class UsageController {
    private usageService: UsageService = new UsageService();
    private clubService: ClubService = new ClubService();

    getUsageSummary(req: Request, res: Response) {
        const { params: { clubId }, query } = usageSummarySchema.parse(req);
        this.clubService.validateClubExists(clubId);
        const summary = this.usageService.getUsageSummary(clubId, query?.dateFrom, query?.dateTo);
        return res.status(StatusCodes.OK).json(summary);
    }

    async adjustCredits(req: Request, res: Response) {
        const { params: { clubId }, body } = usageAdjustmentSchema.parse(req);
        this.clubService.validateClubExists(clubId);
        const result = await this.usageService.adjustCredits(
            clubId,
            body.creditsDelta,
            body.reason,
            body.externalReference ?? null,
            req.user!.userId
        );
        return res.status(StatusCodes.CREATED).json(result);
    }

    async updateUsageAccount(req: Request, res: Response) {
        const { params: { clubId }, body } = usageAccountUpdateSchema.parse(req);
        this.clubService.validateClubExists(clubId);
        const result = await this.usageService.updateOverdraftCutoff(
            clubId,
            body.overdraftCutoff,
            body.reason,
            body.externalReference ?? null,
            req.user!.userId
        );
        return res.status(StatusCodes.OK).json(result);
    }
}
