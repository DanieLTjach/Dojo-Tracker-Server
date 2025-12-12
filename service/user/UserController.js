import { status } from '../../config/constants.js';
import errors from '../../config/messages.js';
import { UserService } from './UserService.js';

export class UserController {
    constructor() {
        this.userService = new UserService();
    }

    async register (req, res) {
        const { user_name, user_telegram, user_telegram_id, user_id } = req.body;
        try {
            if (!user_name || !user_telegram) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: {
                        user_name: !!user_name,
                        user_telegram: !!user_telegram
                    }
                });
            }

            const result = await this.userService.registration(user_name, user_telegram, user_telegram_id, user_id, 0);

            if (result.success === true) {
                return res.status(status.OK).json({ message: result.result });
            } else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        } catch (error) {
            console.error('Registration error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    };

    async edit (req, res) {
        const { telegram_id, updateField, updateInfo, modified_by } = req.body;

        try {
            if (!telegram_id || !updateField || updateInfo === undefined || updateInfo === null || modified_by === undefined || modified_by === null) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: {
                        telegram_id: !!telegram_id,
                        updateField: !!updateField,
                        updateInfo: !!updateInfo,
                        modified_by: modified_by !== undefined && modified_by !== null
                    }
                });
            }

            const result = await this.userService.edit(telegram_id, updateField, updateInfo, modified_by);

            if (result.success === true) {
                return res.status(status.OK).json({ message: result.result });
            }
            else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        } catch (error) {
            console.error('Edit error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    };

    async remove_user (req, res) {
        const { user_id, modified_by } = req.body;

        try {
            if (!user_id || modified_by === undefined || modified_by === null) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: {
                        user_id: !!user_id,
                        modified_by: modified_by !== undefined && modified_by !== null
                    }
                });
            }

            const result = await this.userService.remove(user_id, modified_by);

            if (result.success === true) {
                return res.status(status.OK).json({ message: result.result });
            }
            else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        } catch (error) {
            console.error('Edit error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }

    }

    async activate_user (req, res) {
        const { user_id, modified_by } = req.body;

        try {
            if (!user_id || modified_by === undefined || modified_by === null) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: {
                        user_id: !!user_id,
                        modified_by: modified_by !== undefined && modified_by !== null
                    }
                });
            }

            const result = await this.userService.activate_user(user_id, modified_by);

            if (result.success === true) {
                return res.status(status.OK).json({ message: result.result });
            }
            else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        }
        catch (error) {
            console.error('Activate error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }

    async get_user (req, res) {
        try {
            const { telegram_id } = req.params;

            if (!telegram_id) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: { telegram_id: !!telegram_id }
                });
            }

            const result = await this.userService.get_user(telegram_id);

            if (result.success === true) {
                return res.status(status.OK).json({ message: result.result });
            } else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        }
        catch (error) {
            console.error('Get user error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }

    async get_by (req, res) {
        try {
            const { column, value } = req.body;

            if (!column || !value) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: { column: !!column, value: !!value }
                });
            }

            const result = await this.userService.get_by(column, value);

            if (result.success === true) {
                return res.status(status.OK).json({ message: result.result });
            } else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        }
        catch (error) {
            console.error('Get user error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }
}
