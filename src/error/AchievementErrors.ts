import { NotFoundError } from './BaseErrors.ts';

export class AchievementNotFoundError extends NotFoundError {
    constructor(code: string) {
        super('achievementNotFound', { code });
        this.name = 'AchievementNotFoundError';
    }
}
