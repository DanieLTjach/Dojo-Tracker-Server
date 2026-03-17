import type { Request, Response, NextFunction } from 'express';
import { MissingAuthTokenError } from '../error/AuthErrors.ts';
import { InsufficientClubPermissionsError } from '../error/ClubErrors.ts';
import type { ClubRole } from '../model/ClubModels.ts';
import { ClubMembershipRepository } from '../repository/ClubMembershipRepository.ts';
import { UserService } from '../service/UserService.ts';

const membershipRepository = new ClubMembershipRepository();
const userService = new UserService();

export const requireClubRole = (...roles: ClubRole[]) => {
    return (req: Request, _res: Response, next: NextFunction): void => {
        try {
            if (!req.user) {
                throw new MissingAuthTokenError();
            }

            const user = userService.getUserById(req.user.userId);
            if (user.isAdmin) {
                next();
                return;
            }

            const clubId = Number(req.params['clubId']);
            const userRole = membershipRepository.getUserClubRole(clubId, req.user.userId);
            if (!userRole || !roles.includes(userRole)) {
                throw new InsufficientClubPermissionsError(roles);
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};
