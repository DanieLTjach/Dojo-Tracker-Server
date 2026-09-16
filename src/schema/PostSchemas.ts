import { z } from 'zod';

export const postIdParamSchema = z.coerce.number().int('Post ID must be an integer');
export const entityIdParamSchema = z.coerce.number().int('ID must be an integer');

export const createPostSchema = z.object({
    body: z.object({
        clubId: z.number().int().positive().nullable().optional(),
        gameId: z.number().int().positive().nullable().optional(),
        roundNumber: z.number().int().positive().nullable().optional(),
        text: z.string().max(280).nullable().optional(),
        // Not persisted: it only decides whether this request also publishes the
        // post to the club's Telegram group.
        shareToTelegram: z.boolean().optional(),
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

export const getGamePostsSchema = z.object({
    params: z.object({
        gameId: entityIdParamSchema,
    }),
});

export const postActionSchema = z.object({
    params: z.object({
        id: postIdParamSchema,
    }),
});

export const commentIdParamSchema = z.coerce.number().int('Comment ID must be an integer');

export const updatePostSchema = z.object({
    params: z.object({
        id: postIdParamSchema,
    }),
    // Every field optional so a caller can edit the caption without restating
    // the club - the repository only writes the keys that are present.
    //
    // `images`, when sent, is the post's complete new set: add, replace,
    // reorder and remove all travel as one list.
    body: z.object({
        text: z.string().max(280).nullable().optional(),
        clubId: z.number().int().positive().nullable().optional(),
        images: z.array(
            z.object({
                url: z.string().trim().min(1, 'Image URL cannot be empty'),
                width: z.number().int().positive().nullable().optional(),
                height: z.number().int().positive().nullable().optional(),
            })
        ).min(1, 'Post must have at least one image').max(4, 'Post cannot have more than 4 images').optional(),
    }),
});

export const getCommentsSchema = z.object({
    params: z.object({
        id: postIdParamSchema,
    }),
});

export const createCommentSchema = z.object({
    params: z.object({
        id: postIdParamSchema,
    }),
    body: z.object({
        text: z.string().trim().min(1, 'Comment cannot be empty').max(500),
    }),
});

export const updateCommentSchema = z.object({
    params: z.object({
        commentId: commentIdParamSchema,
    }),
    body: z.object({
        text: z.string().trim().min(1, 'Comment cannot be empty').max(500),
    }),
});

export const commentActionSchema = z.object({
    params: z.object({
        commentId: commentIdParamSchema,
    }),
});
