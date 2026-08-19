export interface Profile {
    userId: number;
    firstNameEn: string | null;
    lastNameEn: string | null;
    firstName: string | null;
    lastName: string | null;
    emaNumber: string | null;
    locale: string | null;
    hideProfile: boolean;
}

/**
 * Fields a profile update may carry.
 *
 * `undefined` means "leave untouched", `null` means "clear it" — the two are
 * distinct, which is why every field is optional *and* nullable rather than
 * simply optional.
 */
export interface ProfileUpdate {
    firstNameEn?: string | null | undefined;
    lastNameEn?: string | null | undefined;
    firstName?: string | null | undefined;
    lastName?: string | null | undefined;
    emaNumber?: string | null | undefined;
    locale?: string | null | undefined;
    hideProfile?: boolean | undefined;
}

/** The full set of stored profile values, as written to the database. */
export type ProfileValues = Omit<Profile, 'userId'>;
