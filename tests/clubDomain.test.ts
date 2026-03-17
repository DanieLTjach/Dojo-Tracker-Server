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

describe('ClubSchemas', () => {
    it('coerces club route params and trims club body fields', () => {
        const parsed = clubCreateSchema.parse({
            body: {
                name: '  Japan Dojo  ',
                address: '  Kyiv  ',
                city: '  Kyiv  ',
                description: '  Test club  ',
                contactInfo: '  @dojo  ',
                isActive: true,
                ratingChatId: '  -100123  ',
                ratingTopicId: '  42  '
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
            isActive: true,
            ratingChatId: '-100123',
            ratingTopicId: '42'
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
        expect(new ClubNotFoundError('Test Club')).toMatchObject({
            statusCode: 404,
            errorCode: 'clubNotFound',
            message: "Клуб 'Test Club' не знайдено"
        });

        expect(new ClubMembershipAlreadyExistsError('Test Club', 8)).toMatchObject({
            statusCode: 400,
            errorCode: 'clubMembershipAlreadyExists',
            message: "Користувач з id 8 вже є учасником клубу 'Test Club'"
        });
    });

    it('formats permission and invalid state messages for later club flows', () => {
        expect(new InsufficientClubPermissionsError(['OWNER', 'MODERATOR']).message)
            .toBe('Недостатньо прав для виконання цієї дії. Потрібна роль: OWNER або MODERATOR');

        expect(new InvalidClubMembershipStateError('активувати', 'INACTIVE', ['PENDING']).message)
            .toBe('Неможливо активувати учасника клубу зі статусом INACTIVE. Дозволені статуси: PENDING');
    });
});
