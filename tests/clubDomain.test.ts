import { ZodError } from 'zod';
import {
    clubCreateSchema,
    clubGetByIdSchema,
    clubMembershipActivateSchema,
    clubMembershipRequestJoinSchema,
    clubMembershipUpdateSchema
} from '../src/schema/ClubSchemas.ts';
import {
    ClubMembershipAlreadyExistsError,
    ClubNotFoundError,
    InsufficientClubPermissionsError,
    InvalidClubMembershipStateError
} from '../src/error/ClubErrors.ts';
import { t } from '../src/i18n/index.ts';

describe('ClubSchemas', () => {
    it('coerces club route params and trims club body fields', () => {
        const parsed = clubCreateSchema.parse({
            body: {
                name: '  Japan Dojo  ',
                address: '  Kyiv  ',
                city: '  Kyiv  ',
                description: '  Test club  ',
                contactInfo: '  @dojo  ',
                isActive: true
            }
        });

        const params = clubGetByIdSchema.parse({
            params: {
                clubId: '7'
            }
        });

        expect(parsed.body).toEqual({
            name: 'Japan Dojo',
            address: 'Kyiv',
            city: 'Kyiv',
            description: 'Test club',
            contactInfo: '@dojo',
            isActive: true
        });
        expect(params.params.clubId).toBe(7);
    });

    it('coerces membership route params', () => {
        const joinRequest = clubMembershipRequestJoinSchema.parse({
            params: {
                clubId: '3'
            }
        });

        const activated = clubMembershipActivateSchema.parse({
            params: {
                clubId: '3',
                userId: '11'
            }
        });

        expect(joinRequest.params).toEqual({ clubId: 3 });
        expect(activated.params).toEqual({ clubId: 3, userId: 11 });
    });

    it('rejects invalid membership role updates', () => {
        expect(() => {
            clubMembershipUpdateSchema.parse({
                params: {
                    clubId: '2',
                    userId: '9'
                },
                body: {
                    role: 'ADMIN'
                }
            });
        }).toThrow(ZodError);
    });
});

describe('ClubErrors', () => {
    it('exposes repository and service friendly error metadata', () => {
        expect(new ClubNotFoundError(42)).toMatchObject({
            statusCode: 404,
            errorCode: 'clubNotFound',
            message: t('errors.clubNotFound', { clubId: 42 })
        });

        expect(new ClubMembershipAlreadyExistsError('Test Club', 8)).toMatchObject({
            statusCode: 400,
            errorCode: 'clubMembershipAlreadyExists',
            message: t('errors.clubMembershipAlreadyExists', { clubName: 'Test Club', userId: 8 })
        });
    });

    it('formats permission and invalid state messages for later club flows', () => {
        expect(new InsufficientClubPermissionsError(['OWNER', 'MODERATOR']).message)
            .toBe(t('errors.insufficientClubPermissions', { rolesText: ['OWNER', 'MODERATOR'].join(t('common.orSeparator')) }));

        expect(new InvalidClubMembershipStateError(t('telegram.actions.activate'), 'INACTIVE', ['PENDING']).message)
            .toBe(t('errors.invalidClubMembershipState', {
                action: t('telegram.actions.activate'),
                currentStatus: 'INACTIVE',
                allowedStatuses: 'PENDING',
            }));
    });
});
