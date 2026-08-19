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
    });

    test('distinguishes null (clear the field) from undefined (leave it alone)', () => {
        const cleared = mergeProfileValues(existing, { emaNumber: null });
        const untouched = mergeProfileValues(existing, { emaNumber: undefined });

        expect(cleared.emaNumber).toBeNull();
        expect(untouched.emaNumber).toBe('11990133');
    });

    test('clears a false hideProfile rather than treating it as absent', () => {
        const hidden = mergeProfileValues({ ...existing, hideProfile: true }, { hideProfile: false });

        expect(hidden.hideProfile).toBe(false);
    });

    test('falls back to empty values when no profile row exists yet', () => {
        const merged = mergeProfileValues(undefined, { firstName: 'Нова' });

        expect(merged).toEqual({
            firstNameEn: null,
            lastNameEn: null,
            firstName: 'Нова',
            lastName: null,
            emaNumber: null,
            locale: null,
            hideProfile: false,
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

    test('allows self-service fields', () => {
        expect(updateTouchesAdminOnlyFields({ firstName: 'Іван', lastName: 'Д', locale: 'uk', hideProfile: true }))
            .toBe(false);
    });

    test('allows an empty update', () => {
        expect(updateTouchesAdminOnlyFields({})).toBe(false);
    });
});
