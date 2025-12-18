import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { UserService } from '../service/UserService.ts';
import { 
    userActivationSchema,
    userEditSchema,
    getUserByTelegramIdSchema,
    userRegistrationSchema, 
    getUserByIdSchema 
} from '../schema/UserSchemas.ts';
import { SYSTEM_USER_ID } from '../../config/constants.js';

export class UserController {
    
    private userService: UserService = new UserService();

    registerUser(req: Request, res: Response) {
        const { name, telegramUsername, telegramId, createdBy } = userRegistrationSchema.parse(req).body;
        const newUser = this.userService.registerUser(name, telegramUsername, telegramId, createdBy ?? SYSTEM_USER_ID);
        return res.status(StatusCodes.CREATED).json(newUser);
    }

    getAllUsers(_req: Request, res: Response) {
        const users = this.userService.getAllUsers();
        return res.status(StatusCodes.OK).json(users);
    }

    getUserById(req: Request, res: Response) {
        const { id } = getUserByIdSchema.parse(req).params;
        const user = this.userService.getUserById(id);
        return res.status(StatusCodes.OK).json(user);
    }

    getUserByTelegramId(req: Request, res: Response) {
        const { telegramId } = getUserByTelegramIdSchema.parse(req).params;
        const user = this.userService.getUserByTelegramId(telegramId);
        return res.status(StatusCodes.OK).json(user);
    }

    editUser(req: Request, res: Response) {
        const { 
            params: { id },
            body: { name, telegramUsername, modifiedBy }
        } = userEditSchema.parse(req);
        
        const editedUser = this.userService.editUser(id, name, telegramUsername, modifiedBy);
        return res.status(StatusCodes.OK).json(editedUser);
    }

    updateUserActivationStatus(req: Request, res: Response, isActive: boolean) {
        const { params: { id }, body: { modifiedBy } } = userActivationSchema.parse(req);
        const activatedUser = this.userService.updateUserActivationStatus(id, isActive, modifiedBy);
        return res.status(StatusCodes.OK).json(activatedUser);
    }
}
