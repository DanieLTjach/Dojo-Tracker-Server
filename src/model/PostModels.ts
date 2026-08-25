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
