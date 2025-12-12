import { status } from '../../config/constants.js';
import errors from '../../config/messages.js';
import { ClubService } from './ClubService.js';

export class ClubController {
    constructor() {
        this.clubService = new ClubService();
    }

    async add(req, res) {
        const { name, modified_by } = req.body;
        try {
            if (!name || modified_by === null) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: {
                        name: !!name
                    }
                });
            }

            const result = await this.clubService.addClub(name, modified_by);

            if (result.success === true) {
                return res.status(status.OK).json({ message: result.result });
            } else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        } catch (error) {
            console.error('Add club error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }

    async edit(req, res) {
        const { id, updateField, updateInfo, modified_by } = req.body;
        try {
            if (id === null || !updateField || !updateInfo || modified_by === null) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: {
                        id: !!id,
                        updateField: !!updateField,
                        updateInfo: !!updateInfo,
                        modified_by: !!modified_by
                    }
                });
            }

            const result = await this.clubService.editClub(id, updateField, updateInfo, modified_by);
            if (result.success === true) {
                return res.status(status.OK).json({ message: result.result });
            } else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        } catch (error) {
            console.error('Edit club error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }

    async remove(req, res) {
        const { id, modified_by } = req.body;
        try {
            if (id === null || !modified_by === null) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: { id: !!id, modified_by: !!modified_by }
                });
            }

            const result = await this.clubService.removeClub(id, modified_by);
            if (result.success === true) {
                return res.status(status.OK).json({ message: result.result });
            } else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        } catch (error) {
            console.error('Remove club error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }

    async list(req, res) {
        try {
            const result = await this.clubService.listClubs();
            if (result.success === true) {
                return res.status(status.OK).json({ result: result.result });
            } else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        } catch (error) {
            console.error('List clubs error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }

    async get(req, res) {
        const { id } = req.params;
        try {
            if (!id) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: { id: !!id }
                });
            }

            const result = await this.clubService.getClub(id);
            if (result.success === true) {
                return res.status(status.OK).json({ result: result.result });
            } else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        } catch (error) {
            console.error('Get club error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }
}
