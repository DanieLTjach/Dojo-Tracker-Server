import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ProfileService } from '../service/ProfileService.ts';
import { profileParamsSchema, profileEditSchema } from '../schema/ProfileSchemas.ts';

export class ProfileController {

    private profileService: ProfileService = new ProfileService();

    getProfile(req: Request, res: Response) {
        const { params: { id } } = profileParamsSchema.parse(req);
        const profile = this.profileService.getProfileByUserId(id);
        return res.status(StatusCodes.OK).json(profile ?? null);
    }

    updateProfile(req: Request, res: Response) {
        const {
            params: { id },
            body: { firstNameEn, lastNameEn, emaNumber, hideProfile }
        } = profileEditSchema.parse(req);

        const modifiedBy = req.user!.userId;
        const updatedProfile = this.profileService.updateProfile(
            id,
            firstNameEn,
            lastNameEn,
            emaNumber,
            hideProfile,
            modifiedBy
        );
        return res.status(StatusCodes.OK).json(updatedProfile);
    }
}
