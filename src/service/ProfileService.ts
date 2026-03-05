import { ProfileRepository } from '../repository/ProfileRepository.ts';
import { UserService } from './UserService.ts';
import type { Profile } from '../model/ProfileModels.ts';
import { InsufficientPermissionsError } from '../error/AuthErrors.ts';

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
        this.validateProfileUpdatePermissions(userId, firstNameEn, lastNameEn, emaNumber, modifiedBy);

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

    /**
     * Non-admin users can only update hideProfile on their own profile.
     * Admins can update all fields on any profile.
     */
    private validateProfileUpdatePermissions(
        userId: number,
        firstNameEn: string | null | undefined,
        lastNameEn: string | null | undefined,
        emaNumber: string | null | undefined,
        modifiedBy: number
    ): void {
        const modifier = this.userService.getUserById(modifiedBy);
        if (modifier.isAdmin) {
            return;
        }

        // Non-admin: must be updating own profile
        if (modifiedBy !== userId) {
            throw new InsufficientPermissionsError();
        }

        // Non-admin: can only update hideProfile (no other fields allowed)
        if (firstNameEn !== undefined || lastNameEn !== undefined || emaNumber !== undefined) {
            throw new InsufficientPermissionsError();
        }
    }
}
