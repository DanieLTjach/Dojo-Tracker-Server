import { ProfileRepository } from '../repository/ProfileRepository.ts';
import { UserService } from './UserService.ts';
import type { Profile, ProfileUpdate, ProfileValues } from '../model/ProfileModels.ts';
import { InsufficientPermissionsError } from '../error/AuthErrors.ts';

/** Fields only an admin may change on a profile. */
const ADMIN_ONLY_FIELDS = [
    'firstNameEn',
    'lastNameEn',
    'emaNumber',
] as const satisfies readonly (keyof ProfileUpdate)[];

const EMPTY_PROFILE_VALUES: ProfileValues = {
    firstNameEn: null,
    lastNameEn: null,
    firstName: null,
    lastName: null,
    emaNumber: null,
    locale: null,
    hideProfile: false,
    avatarUrl: null,
    statusLine: null,
    birthDay: null,
    birthMonth: null,
    birthYear: null,
    hideBirthYear: false,
    city: null,
    favouriteYaku: null,
    favouriteTile: null,
    discord: null,
    majsoulAccount: null,
    tenhouAccount: null,
};

/**
 * Merges an update over the stored profile, leaving any field the update did
 * not mention untouched. Pure, so it is unit-testable without a database.
 */
export function mergeProfileValues(existing: Profile | undefined, update: ProfileUpdate): ProfileValues {
    const base: ProfileValues = existing ?? EMPTY_PROFILE_VALUES;

    return {
        firstNameEn: update.firstNameEn !== undefined ? update.firstNameEn : base.firstNameEn,
        lastNameEn: update.lastNameEn !== undefined ? update.lastNameEn : base.lastNameEn,
        firstName: update.firstName !== undefined ? update.firstName : base.firstName,
        lastName: update.lastName !== undefined ? update.lastName : base.lastName,
        emaNumber: update.emaNumber !== undefined ? update.emaNumber : base.emaNumber,
        locale: update.locale !== undefined ? update.locale : base.locale,
        hideProfile: update.hideProfile !== undefined ? update.hideProfile : base.hideProfile,
        avatarUrl: update.avatarUrl !== undefined ? update.avatarUrl : base.avatarUrl,
        statusLine: update.statusLine !== undefined ? update.statusLine : base.statusLine,
        birthDay: update.birthDay !== undefined ? update.birthDay : base.birthDay,
        birthMonth: update.birthMonth !== undefined ? update.birthMonth : base.birthMonth,
        birthYear: update.birthYear !== undefined ? update.birthYear : base.birthYear,
        hideBirthYear: update.hideBirthYear !== undefined ? update.hideBirthYear : base.hideBirthYear,
        city: update.city !== undefined ? update.city : base.city,
        favouriteYaku: update.favouriteYaku !== undefined ? update.favouriteYaku : base.favouriteYaku,
        favouriteTile: update.favouriteTile !== undefined ? update.favouriteTile : base.favouriteTile,
        discord: update.discord !== undefined ? update.discord : base.discord,
        majsoulAccount: update.majsoulAccount !== undefined ? update.majsoulAccount : base.majsoulAccount,
        tenhouAccount: update.tenhouAccount !== undefined ? update.tenhouAccount : base.tenhouAccount,
    };
}

/** Whether an update touches any field reserved for admins. */
export function updateTouchesAdminOnlyFields(update: ProfileUpdate): boolean {
    return ADMIN_ONLY_FIELDS.some(field => update[field] !== undefined);
}

/**
 * Strips the birth year server-side when hideBirthYear is true, unless the requester
 * is the profile owner or an admin.
 */
export function applyBirthYearVisibility(
    profile: Profile,
    requestingUserId?: number,
    isRequesterAdmin?: boolean
): Profile {
    if (!profile.hideBirthYear) {
        return profile;
    }
    if (isRequesterAdmin) {
        return profile;
    }
    if (requestingUserId !== undefined && requestingUserId === profile.userId) {
        return profile;
    }
    return {
        ...profile,
        birthYear: null,
    };
}

export class ProfileService {
    private profileRepository: ProfileRepository = new ProfileRepository();
    private userService: UserService = new UserService();

    updateProfile(userId: number, update: ProfileUpdate, modifiedBy: number): Profile {
        this.userService.validateUserExistsById(userId);
        this.validateProfileUpdatePermissions(userId, update, modifiedBy);

        const existing = this.profileRepository.findProfileByUserId(userId);
        this.profileRepository.upsertProfile(userId, mergeProfileValues(existing, update), modifiedBy);

        return this.profileRepository.findProfileByUserId(userId)!;
    }

    getProfileByUserId(userId: number): Profile | undefined {
        return this.profileRepository.findProfileByUserId(userId);
    }

    updateProfileNames(
        userId: number,
        firstName: string | null | undefined,
        lastName: string | null | undefined,
        modifiedBy: number
    ): Profile {
        this.userService.validateUserExistsById(userId);
        this.profileRepository.updateProfileNames(userId, firstName, lastName, modifiedBy);
        return this.profileRepository.findProfileByUserId(userId)!;
    }

    /**
     * Non-admin users can only update their own public settings.
     * Admins can update all fields on any profile.
     */
    private validateProfileUpdatePermissions(userId: number, update: ProfileUpdate, modifiedBy: number): void {
        const modifier = this.userService.getUserById(modifiedBy);
        if (modifier.isAdmin) {
            return;
        }

        // Non-admin: must be updating own profile
        if (modifiedBy !== userId) {
            throw new InsufficientPermissionsError();
        }

        // Non-admin can update hideProfile, locale, and own native-language firstName/lastName,
        // but not EMA fields or emaNumber.
        if (updateTouchesAdminOnlyFields(update)) {
            throw new InsufficientPermissionsError();
        }
    }
}
