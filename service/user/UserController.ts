import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { UserService } from './UserService.ts';
import { userActivationSchema, userEditSchema, userGetSchema, userRegistrationSchema } from './UserSchemas.ts';
import { SYSTEM_USER_ID } from '../../config/constants.js';

export class UserController {
    private userService: UserService;

    constructor() {
        this.userService = new UserService();
    }

    async registerUser(req: Request, res: Response) {
        const { name, telegramUsername, telegramId, createdBy } = userRegistrationSchema.parse(req).body;
        const newUser = await this.userService.registerUser(name, telegramUsername, telegramId, createdBy ?? SYSTEM_USER_ID);
        return res.status(StatusCodes.OK).json(newUser);
    }

    async getUser(req: Request, res: Response) {
        const { telegramId } = userGetSchema.parse(req).params;
        const user = await this.userService.getUserByTelegramId(telegramId);
        return res.status(StatusCodes.OK).json(user);
    }

    async editUser(req: Request, res: Response) {
        const { params: { telegramId }, body: { name, telegramUsername, modifiedBy } } = userEditSchema.parse(req);
        const editedUser = await this.userService.editUser(telegramId, name, telegramUsername, modifiedBy);
        return res.status(StatusCodes.OK).json(editedUser);
    }

    async updateUserActivationStatus(req: Request, res: Response, isActive: boolean) {
        const { params: { telegramId }, body: { modifiedBy } } = userActivationSchema.parse(req);
        const activatedUser = await this.userService.updateUserActivationStatus(telegramId, isActive, modifiedBy);
        return res.status(StatusCodes.OK).json(activatedUser);
    }
}
