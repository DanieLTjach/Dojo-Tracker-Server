import { ProfileRepository } from '../repository/ProfileRepository.ts';
import { UserService } from './UserService.ts';
import type { Profile } from '../model/ProfileModels.ts';

export class ProfileService {

    private profileRepository: ProfileRepository = new ProfileRepository();
    private userService: UserService = new UserService();

    updateProfile(
        userId: number,
        firstNameEn: string | null | undefined,
        lastNameEn: string | null | undefined,
        emaNumber: string | null | undefined,
        hideProfile: boolean | undefined,
        modifiedBy: number
    ): Profile {
        this.userService.validateUserExistsById(userId);

        const existing = this.profileRepository.findProfileByUserId(userId);

        this.profileRepository.upsertProfile(
            userId,
            firstNameEn !== undefined ? firstNameEn : existing?.firstNameEn ?? null,
            lastNameEn !== undefined ? lastNameEn : existing?.lastNameEn ?? null,
            emaNumber !== undefined ? emaNumber : existing?.emaNumber ?? null,
            hideProfile !== undefined ? hideProfile : existing?.hideProfile ?? false,
            modifiedBy
        );

        return this.profileRepository.findProfileByUserId(userId)!;
    }
}
