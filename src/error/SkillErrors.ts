import { BadRequestError } from './BaseErrors.ts';

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
