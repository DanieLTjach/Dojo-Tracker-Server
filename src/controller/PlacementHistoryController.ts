import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { getUserPlacementsSchema } from '../schema/PlacementSchemas.ts';
import { PlacementHistoryService } from '../service/PlacementHistoryService.ts';

export class PlacementHistoryController {
    private placementHistoryService: PlacementHistoryService;

    constructor(placementHistoryService = new PlacementHistoryService()) {
        this.placementHistoryService = placementHistoryService;
    }

    getUserPlacements(req: Request, res: Response) {
        const { params: { userId } } = getUserPlacementsSchema.parse(req);
        const placements = this.placementHistoryService.getUserPlacementHistory(userId);
        return res.status(StatusCodes.OK).json(placements);
    }
}
