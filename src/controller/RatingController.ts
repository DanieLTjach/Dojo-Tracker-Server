import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
    getAllUsersCurrentRatingSchema,
    getAllUsersTotalRatingChangeDuringPeriodSchema,
    getUserRatingHistorySchema,
} from '../schema/RatingSchemas.ts';
import { RatingService } from '../service/RatingService.ts';

export class RatingController {
    private ratingService: RatingService = new RatingService();

    getAllUsersCurrentRating(req: Request, res: Response) {
        const {
            params: { eventId },
        } = getAllUsersCurrentRatingSchema.parse(req);
        const ratings = this.ratingService.getAllUsersCurrentRating(eventId);
        return res.status(StatusCodes.OK).json(ratings);
    }

    getAllUsersTotalRatingChangeDuringPeriod(req: Request, res: Response) {
        const {
            params: { eventId },
            query: { dateFrom, dateTo },
        } = getAllUsersTotalRatingChangeDuringPeriodSchema.parse(req);
        const ratingChanges = this.ratingService.getAllUsersTotalRatingChangeDuringPeriod(eventId, dateFrom, dateTo);
        return res.status(StatusCodes.OK).json(ratingChanges);
    }

    getUserRatingHistory(req: Request, res: Response) {
        const {
            params: { userId, eventId },
        } = getUserRatingHistorySchema.parse(req);
        const ratingHistory = this.ratingService.getUserRatingHistory(userId, eventId);
        return res.status(StatusCodes.OK).json(ratingHistory);
    }
}
