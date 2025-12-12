import { status } from '../../config/constants.js';
import errors from '../../config/messages.js';
import { EventService } from './EventService.js';

export class EventController {
    constructor() {
        this.eventService = new EventService();
    }

    async add(req, res) {
        const { name, type, date_from, date_to, modified_by } = req.body;
        try {
            if (!name || !type || !date_from || !date_to || modified_by === null || modified_by === undefined) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: {
                        name: !!name,
                        type: !!type,
                        date_from: !!date_from,
                        date_to: !!date_to,
                        modified_by: !!modified_by
                    }
                });
            }

            const result = await this.eventService.addEvent(name, type, date_from, date_to, modified_by);

            if (result.success === true) {
                return res.status(status.OK).json({ message: result.result });
            } else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        } catch (error) {
            console.error('Add event error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }

    async edit(req, res) {
        const { id, name, type, date_from, date_to, modified_by } = req.body;
        try {
            if (!id || !name || !type || !date_from || !date_to || !modified_by) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: {
                        id: !!id,
                        name: !!name,
                        type: !!type,
                        date: !!date,
                        location: !!location,
                        modified_by: !!modified_by
                    }
                });
            }

            const result = await this.eventService.editEvent(id, name, type, date_from, date_to, modified_by);

            if (result.success === true) {
                return res.status(status.OK).json({ message: result.result });
            } else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        } catch (error) {
            console.error('Edit event error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }

    async remove(req, res) {
        const { id, modified_by } = req.body;
        try {
            if (!id || !modified_by) {
                return res.status(status.ERROR).json({
                    message: errors.MissingFields,
                    details: {
                        id: !!id,
                        modified_by: !!modified_by
                    }
                });
            }

            const result = await this.eventService.removeEvent(id, modified_by);

            if (result.success === true) {
                return res.status(status.OK).json({ message: result.result });
            } else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        } catch (error) {
            console.error('Remove event error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }

    async list(req, res) {
        try {
            const result = await this.eventService.listEvents();
            if (result.success === true) {
                return res.status(status.OK).json({ result: result.result });
            } else {
                return res.status(status.ERROR).json({
                    message: result.result,
                    details: result
                });
            }
        } catch (error) {
            console.error('List events error:', error);
            return res.status(status.ERROR).json({
                message: errors.InternalServerError,
                details: error.message
            });
        }
    }
}
