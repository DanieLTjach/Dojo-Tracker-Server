import { mergeProfileValues, updateTouchesAdminOnlyFields } from '../src/service/ProfileService.ts';
import type { Profile } from '../src/model/ProfileModels.ts';

const existing: Profile = {
    userId: 7,
    firstNameEn: 'John',
    lastNameEn: 'Doe',
    firstName: 'Іван',
    lastName: 'Дорошенко',
    emaNumber: '11990133',
    locale: 'uk',
    hideProfile: false,
    avatarUrl: 'https://example.com/avatar.png',
    statusLine: 'Riichi addict',
    birthDay: 15,
    birthMonth: 8,
    birthYear: 1995,
    hideBirthYear: false,
    city: 'Kyiv',
    favouriteYaku: 'Riichi',
    favouriteTile: '1m',
    discord: 'ivan_d',
    majsoulAccount: 'IvanMajsoul',
    tenhouAccount: 'NoName',
};

describe('mergeProfileValues', () => {
    test('leaves every field untouched for an empty update', () => {
        const { userId: _userId, ...storedValues } = existing;

        expect(mergeProfileValues(existing, {})).toEqual(storedValues);
    });

    test('overwrites only the fields the update mentions', () => {
        const merged = mergeProfileValues(existing, { firstName: 'Петро' });

        expect(merged.firstName).toBe('Петро');
        expect(merged.lastName).toBe('Дорошенко');
        expect(merged.emaNumber).toBe('11990133');
        expect(merged.avatarUrl).toBe('https://example.com/avatar.png');
        expect(merged.city).toBe('Kyiv');
    });

    test('single-field social update leaves all other fields alone', () => {
        const merged = mergeProfileValues(existing, { statusLine: 'Chasing Yakuman' });

        expect(merged.statusLine).toBe('Chasing Yakuman');
        expect(merged.avatarUrl).toBe('https://example.com/avatar.png');
        expect(merged.birthDay).toBe(15);
        expect(merged.birthMonth).toBe(8);
        expect(merged.birthYear).toBe(1995);
        expect(merged.hideBirthYear).toBe(false);
        expect(merged.city).toBe('Kyiv');
        expect(merged.favouriteYaku).toBe('Riichi');
        expect(merged.favouriteTile).toBe('1m');
        expect(merged.discord).toBe('ivan_d');
        expect(merged.majsoulAccount).toBe('IvanMajsoul');
        expect(merged.tenhouAccount).toBe('NoName');
    });

    test('distinguishes null (clear the field) from undefined (leave it alone)', () => {
        const cleared = mergeProfileValues(existing, {
            emaNumber: null,
            avatarUrl: null,
            discord: null,
        });
        const untouched = mergeProfileValues(existing, {
            emaNumber: undefined,
            avatarUrl: undefined,
            discord: undefined,
        });

        expect(cleared.emaNumber).toBeNull();
        expect(cleared.avatarUrl).toBeNull();
        expect(cleared.discord).toBeNull();

        expect(untouched.emaNumber).toBe('11990133');
        expect(untouched.avatarUrl).toBe('https://example.com/avatar.png');
        expect(untouched.discord).toBe('ivan_d');
    });

    test('clears a false hideProfile and hideBirthYear rather than treating them as absent', () => {
        const hidden = mergeProfileValues(
            { ...existing, hideProfile: true, hideBirthYear: true },
            { hideProfile: false, hideBirthYear: false }
        );

        expect(hidden.hideProfile).toBe(false);
        expect(hidden.hideBirthYear).toBe(false);
    });

    test('falls back to empty values when no profile row exists yet', () => {
        const merged = mergeProfileValues(undefined, {
            firstName: 'Нова',
            city: 'Lviv',
            favouriteYaku: 'Tanyao',
        });

        expect(merged).toEqual({
            firstNameEn: null,
            lastNameEn: null,
            firstName: 'Нова',
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
            city: 'Lviv',
            favouriteYaku: 'Tanyao',
            favouriteTile: null,
            discord: null,
            majsoulAccount: null,
            tenhouAccount: null,
        });
    });
});

describe('updateTouchesAdminOnlyFields', () => {
    test.each([
        ['firstNameEn', { firstNameEn: 'John' }],
        ['lastNameEn', { lastNameEn: 'Doe' }],
        ['emaNumber', { emaNumber: '123' }],
    ])('flags %s as admin-only', (_label, update) => {
        expect(updateTouchesAdminOnlyFields(update)).toBe(true);
    });

    test('flags an admin-only field that is being cleared', () => {
        expect(updateTouchesAdminOnlyFields({ emaNumber: null })).toBe(true);
    });

    test('allows self-service social fields', () => {
        expect(
            updateTouchesAdminOnlyFields({
                firstName: 'Іван',
                lastName: 'Д',
                locale: 'uk',
                hideProfile: true,
                avatarUrl: 'https://example.com/avatar.png',
                statusLine: 'Test',
                birthDay: 1,
                birthMonth: 2,
                birthYear: 2000,
                hideBirthYear: true,
                city: 'Kyiv',
                favouriteYaku: 'Riichi',
                favouriteTile: '1m',
                discord: 'user',
                majsoulAccount: 'MajsoulUser',
                tenhouAccount: 'TenhouUser',
            })
        ).toBe(false);
    });

    test('allows an empty update', () => {
        expect(updateTouchesAdminOnlyFields({})).toBe(false);
    });
});
