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
 * Only the caption and club are editable. Images are deliberately immutable:
 * re-ordering or swapping them would orphan Storage objects that the cleanup
 * script only collects after an age delay, and nothing in the UI asks for it.
 */
export interface UpdatePostDTO {
    text?: string | null | undefined;
    clubId?: number | null | undefined;
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
