import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ProfileService } from '../service/ProfileService.ts';
import { profileEditSchema } from '../schema/ProfileSchemas.ts';

export class ProfileController {
    private profileService: ProfileService = new ProfileService();

    updateProfile(req: Request, res: Response) {
        const { params: { id }, body } = profileEditSchema.parse(req);

        const updatedProfile = this.profileService.updateProfile(id, body, req.user!.userId);
        return res.status(StatusCodes.OK).json(updatedProfile);
    }
}
