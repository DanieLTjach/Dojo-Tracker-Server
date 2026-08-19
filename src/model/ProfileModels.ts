export interface Profile {
    userId: number;
    firstNameEn: string | null;
    lastNameEn: string | null;
    firstName: string | null;
    lastName: string | null;
    emaNumber: string | null;
    locale: string | null;
    hideProfile: boolean;
    avatarUrl: string | null;
    statusLine: string | null;
    birthDay: number | null;
    birthMonth: number | null;
    birthYear: number | null;
    hideBirthYear: boolean;
    city: string | null;
    favouriteYaku: string | null;
    favouriteTile: string | null;
    discord: string | null;
    majsoulAccount: string | null;
    tenhouAccount: string | null;
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
    avatarUrl?: string | null | undefined;
    statusLine?: string | null | undefined;
    birthDay?: number | null | undefined;
    birthMonth?: number | null | undefined;
    birthYear?: number | null | undefined;
    hideBirthYear?: boolean | undefined;
    city?: string | null | undefined;
    favouriteYaku?: string | null | undefined;
    favouriteTile?: string | null | undefined;
    discord?: string | null | undefined;
    majsoulAccount?: string | null | undefined;
    tenhouAccount?: string | null | undefined;
}

/** The full set of stored profile values, as written to the database. */
export type ProfileValues = Omit<Profile, 'userId'>;
