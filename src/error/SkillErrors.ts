import { BadRequestError, InternalServerError } from './BaseErrors.ts';

export class SkillRatingNotEnabledForClubError extends BadRequestError {
    constructor(clubId: number) {
        super('skillRatingNotEnabledForClub', { clubId });
    }
}

export class InvalidGameSizeError extends BadRequestError {
    constructor(gameSize: number) {
        super('invalidGameSize', { gameSize });
    }
}

export class SkillTrackRecomputeFailedError extends InternalServerError {
    constructor(clubId: number, gameSize: number, reason?: string) {
        super('skillTrackRecomputeFailed', { clubId, gameSize, reason: reason ?? 'Unknown error' });
    }
}

export const SkillRatingNotEnabledForClub = SkillRatingNotEnabledForClubError;
export const InvalidGameSize = InvalidGameSizeError;
export const SkillTrackRecomputeFailed = SkillTrackRecomputeFailedError;
