const status = require('../../config/constants').STATUS;
const errors = require('../../config/messages');

const { new_Achievement, grant_Achievement, list_Achievements, user_achievements } = require('./AchievementsLogic');

exports.newAchievement = async (req, res) => {
    const { name, description, modified_by } = req.body;
    try {
        if (!name || !description || !modified_by) {
            return res.status(status.ERROR).json({
                message: errors.EmptyFields,
                details: {
                    name: !!name,
                    description: !!description,
                    modified_by: !!modified_by
                }
            });
        }
        const result = await new_Achievement(name, description, modified_by);
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
};

exports.grantAchievement = async (req, res) => {
    const { user_id, achievement_id, modified_by } = req.body;
    try {
        if (!user_id || !achievement_id || !modified_by) {
            return res.status(status.ERROR).json({ 
                message: errors.EmptyFields, 
                details: {
                    user_id: !!user_id,
                    achievement_id: !!achievement_id,
                    modified_by: !!modified_by
                }
            });
        }

        const result = await grant_Achievement(user_id, achievement_id, modified_by);
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

};

exports.listAchievements = async (req, res) => {
    try {
        const result = await list_Achievements();
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
};

exports.userAchievements = async (req, res) => {
    const { user_id } = req.body;
    try {
        if (!user_id) {
            return res.status(status.ERROR).json({ 
                message: errors.EmptyFields, 
                details: { user_id: !!user_id }
            });
        }

        const result = await user_achievements(user_id);
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
};

const {} = require('./AchievementsLogic');