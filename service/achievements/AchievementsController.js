import { status } from '../../config/constants.js';
import errors from '../../config/messages.js';
import { AchievementsService } from './AchievementsService.js';

export class AchievementsController {
    constructor() {
        this.achievementsService = new AchievementsService();
    }

    async newAchievement(req, res) {
        const { name, description, modified_by } = req.body;
        try {
            if (!name || !description || !modified_by) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: {
                        name: !!name,
                        description: !!description,
                        modified_by: !!modified_by
                    }
                });
            }
            const result = await this.achievementsService.new_Achievement(name, description, modified_by);
            if (result.success === true) {
                return res.status(status.OK).json({ message: result.result });
            } else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        } catch (error) {
            console.error('New achievement error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }

    async grantAchievement(req, res) {
        const { user_id, achievement_id, modified_by } = req.body;
        try {
            if (!user_id || !achievement_id || !modified_by) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: {
                        user_id: !!user_id,
                        achievement_id: !!achievement_id,
                        modified_by: !!modified_by
                    }
                });
            }

            const result = await this.achievementsService.grant_Achievement(user_id, achievement_id, modified_by);
            if (result.success === true) {
                return res.status(status.OK).json({ message: result.result });
            } else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        } catch (error) {
            console.error('Grant achievement error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }

    }

    async listAchievements(req, res) {
        try {
            const result = await this.achievementsService.list_Achievements();
            if (result.success === true) {
                return res.status(status.OK).json({ result: result.result });
            } else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        }
        catch (error) {
            console.error('List achievements error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }

    async userAchievements(req, res) {
        const { user_id } = req.body;
        try {
            if (!user_id) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: { user_id: !!user_id }
                });
            }

            const result = await this.achievementsService.user_achievements(user_id);
            if (result.success === true) {
                return res.status(status.OK).json({ result: result.result });
            } else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        } catch (error) {
            console.error('User achievements error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }
}