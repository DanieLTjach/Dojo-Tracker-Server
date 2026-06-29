import { StatusCodes } from 'http-status-codes';
import { ResponseStatusError } from './BaseErrors.ts';

export class NotEnoughCreditsError extends ResponseStatusError {
    constructor(clubId: number, balance: number, cutoff: number, attemptedCharge: number) {
        super(
            StatusCodes.PAYMENT_REQUIRED,
            `Club ${clubId} does not have enough usage credits. Balance ${balance}, attempted charge ${attemptedCharge}, cutoff ${cutoff}.`,
            'notEnoughCredits'
        );
        this.name = 'NotEnoughCreditsError';
    }
}
