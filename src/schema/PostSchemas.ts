import { z } from 'zod';

export const postIdParamSchema = z.coerce.number().int('Post ID must be an integer');
export const entityIdParamSchema = z.coerce.number().int('ID must be an integer');

export const createPostSchema = z.object({
    body: z.object({
        clubId: z.number().int().positive().nullable().optional(),
        gameId: z.number().int().positive().nullable().optional(),
        text: z.string().max(280).nullable().optional(),
        images: z.array(
            z.object({
                url: z.string().trim().min(1, 'Image URL cannot be empty'),
                width: z.number().int().positive().nullable().optional(),
                height: z.number().int().positive().nullable().optional(),
            })
        ).min(1, 'Post must have at least one image').max(4, 'Post cannot have more than 4 images'),
    }),
});

export const getPostByIdSchema = z.object({
    params: z.object({
        id: postIdParamSchema,
    }),
});

export const getUserPostsSchema = z.object({
    params: z.object({
        id: entityIdParamSchema,
    }),
});

export const getClubPostsSchema = z.object({
    params: z.object({
        id: entityIdParamSchema,
    }),
});

export const postActionSchema = z.object({
    params: z.object({
        id: postIdParamSchema,
    }),
});
