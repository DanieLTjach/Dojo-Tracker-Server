export interface PostImage {
    id: number;
    postId: number;
    url: string;
    width: number | null;
    height: number | null;
    sortOrder: number;
}

export interface PostAuthor {
    id: number;
    name: string;
    avatarUrl: string | null;
}

export interface PostGameTag {
    id: number;
    playedAt: Date | string;
    placement?: number | undefined;
    score?: number | undefined;
    clubName?: string | undefined;
    length?: string | undefined;
}

export interface Post {
    id: number;
    authorId: number;
    author: PostAuthor;
    clubId: number | null;
    gameId: number | null;
    game?: PostGameTag | null | undefined;
    text: string | null;
    images: { id: number, url: string, width: number | null, height: number | null }[];
    likeCount: number;
    commentCount: number;
    likedByMe: boolean;
    createdAt: Date | string;
    editedAt?: Date | string | null | undefined;
}

export interface CreatePostImageDTO {
    url: string;
    width?: number | null | undefined;
    height?: number | null | undefined;
}

export interface CreatePostDTO {
    clubId?: number | null | undefined;
    gameId?: number | null | undefined;
    text?: string | null | undefined;
    images: CreatePostImageDTO[];
}

/**
 * Every field is optional: only the keys present are written, so editing a
 * caption cannot clear the club by omission.
 *
 * `images`, when given, is the complete set the post should end up with -
 * add, replace, reorder and remove are all expressed as "here is the new
 * list". Objects dropped from it stay in Storage until the orphan cleanup
 * script collects them, which is exactly what that script is for.
 */
export interface UpdatePostDTO {
    text?: string | null | undefined;
    clubId?: number | null | undefined;
    images?: CreatePostImageDTO[] | undefined;
}

export interface PostComment {
    id: number;
    postId: number;
    authorId: number;
    author: PostAuthor;
    text: string;
    createdAt: Date | string;
    editedAt: Date | string | null;
    likeCount: number;
    likedByMe: boolean;
}

export interface CreateCommentDTO {
    text: string;
}
