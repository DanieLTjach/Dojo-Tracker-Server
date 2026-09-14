import { BadRequestError, ForbiddenError, NotFoundError } from '../error/BaseErrors.ts';
import type {
    CreateCommentDTO,
    CreatePostDTO,
    Post,
    PostComment,
    UpdatePostDTO,
} from '../model/PostModels.ts';
import { ClubMembershipRepository } from '../repository/ClubMembershipRepository.ts';
import { ClubRepository } from '../repository/ClubRepository.ts';
import { PostRepository } from '../repository/PostRepository.ts';

export const COMMENT_MAX_LENGTH = 500;

export class PostService {
    private postRepository: PostRepository;
    private clubRepository: ClubRepository;
    private clubMembershipRepository: ClubMembershipRepository;

    constructor(
        postRepository: PostRepository = new PostRepository(),
        clubRepository: ClubRepository = new ClubRepository(),
        clubMembershipRepository: ClubMembershipRepository = new ClubMembershipRepository()
    ) {
        this.postRepository = postRepository;
        this.clubRepository = clubRepository;
        this.clubMembershipRepository = clubMembershipRepository;
    }

    createPost(authorId: number, dto: CreatePostDTO): Post {
        if (!dto.images || !Array.isArray(dto.images) || dto.images.length === 0) {
            throw new BadRequestError('postMustHaveImages');
        }
        if (dto.images.length > 4) {
            throw new BadRequestError('postMaxFourImages');
        }
        for (const img of dto.images) {
            if (!img.url || typeof img.url !== 'string') {
                throw new BadRequestError('postInvalidImageUrl');
            }
        }
        if (dto.text && dto.text.length > 280) {
            throw new BadRequestError('postTextTooLong');
        }
        if (dto.clubId != null) {
            const club = this.clubRepository.findClubById(dto.clubId);
            if (!club) {
                throw new NotFoundError('clubNotFound');
            }
        }

        const postId = this.postRepository.createPost(authorId, dto);
        const createdPost = this.postRepository.findPostById(postId, authorId);
        if (!createdPost) {
            throw new NotFoundError('postNotFound');
        }
        return createdPost;
    }

    getPostById(postId: number, currentUserId?: number): Post {
        const post = this.postRepository.findPostById(postId, currentUserId);
        if (!post) {
            throw new NotFoundError('postNotFound');
        }
        return post;
    }

    getUserPosts(userId: number, currentUserId?: number): Post[] {
        return this.postRepository.findPostsByAuthorId(userId, currentUserId);
    }

    getClubPosts(clubId: number, currentUserId?: number): Post[] {
        const club = this.clubRepository.findClubById(clubId);
        if (!club) {
            throw new NotFoundError('clubNotFound');
        }
        return this.postRepository.findPostsByClubId(clubId, currentUserId);
    }

    /**
     * True when the requester owns or moderates the club a post was filed under.
     * A post with no club has no moderators, only its author and site admins.
     */
    private isClubModerator(clubId: number | null, userId: number): boolean {
        if (clubId == null) {
            return false;
        }
        const membership = this.clubMembershipRepository.findMembership(clubId, userId);
        return Boolean(
            membership && membership.status === 'ACTIVE' &&
                (membership.role === 'OWNER' || membership.role === 'MODERATOR')
        );
    }

    updatePost(postId: number, dto: UpdatePostDTO, requester: { id: number }): Post {
        const post = this.postRepository.findPostById(postId);
        if (!post) {
            throw new NotFoundError('postNotFound');
        }

        // Editing is author-only on purpose. Moderators can remove a post they
        // object to, but putting words in someone else's mouth is a different
        // power, and nothing in the product asks for it.
        if (post.authorId !== requester.id) {
            throw new ForbiddenError('postEditForbidden');
        }

        if (dto.text != null && dto.text.length > 280) {
            throw new BadRequestError('postTextTooLong');
        }
        if (dto.clubId != null) {
            const club = this.clubRepository.findClubById(dto.clubId);
            if (!club) {
                throw new NotFoundError('clubNotFound');
            }
        }

        this.postRepository.updatePost(postId, dto);
        const updated = this.postRepository.findPostById(postId, requester.id);
        if (!updated) {
            throw new NotFoundError('postNotFound');
        }
        return updated;
    }

    deletePost(postId: number, requester: { id: number, isAdmin: boolean }): void {
        const post = this.postRepository.findPostById(postId);
        if (!post) {
            throw new NotFoundError('postNotFound');
        }

        const isAuthor = post.authorId === requester.id;
        const canModerate = this.isClubModerator(post.clubId, requester.id);

        if (!isAuthor && !requester.isAdmin && !canModerate) {
            throw new ForbiddenError('postDeleteForbidden');
        }

        this.postRepository.deletePost(postId);
    }

    getComments(postId: number, currentUserId?: number): PostComment[] {
        const post = this.postRepository.findPostById(postId);
        if (!post) {
            throw new NotFoundError('postNotFound');
        }
        return this.postRepository.findCommentsByPostId(postId, currentUserId);
    }

    createComment(postId: number, authorId: number, dto: CreateCommentDTO): PostComment {
        const post = this.postRepository.findPostById(postId);
        if (!post) {
            throw new NotFoundError('postNotFound');
        }

        const text = dto.text?.trim() ?? '';
        if (!text) {
            throw new BadRequestError('commentTextRequired');
        }
        if (text.length > COMMENT_MAX_LENGTH) {
            throw new BadRequestError('commentTextTooLong');
        }

        const commentId = this.postRepository.createComment(postId, authorId, { text });
        const created = this.postRepository.findCommentById(commentId, authorId);
        if (!created) {
            throw new NotFoundError('commentNotFound');
        }
        return created;
    }

    updateComment(commentId: number, dto: CreateCommentDTO, requester: { id: number }): PostComment {
        const comment = this.postRepository.findCommentById(commentId);
        if (!comment) {
            throw new NotFoundError('commentNotFound');
        }
        // Same reasoning as post edits: only the author may reword their comment.
        if (comment.authorId !== requester.id) {
            throw new ForbiddenError('commentEditForbidden');
        }

        const text = dto.text?.trim() ?? '';
        if (!text) {
            throw new BadRequestError('commentTextRequired');
        }
        if (text.length > COMMENT_MAX_LENGTH) {
            throw new BadRequestError('commentTextTooLong');
        }

        this.postRepository.updateComment(commentId, text);
        const updated = this.postRepository.findCommentById(commentId, requester.id);
        if (!updated) {
            throw new NotFoundError('commentNotFound');
        }
        return updated;
    }

    /**
     * Removable by the comment's author, the post's author (you moderate your
     * own thread), a club moderator, or a site admin.
     */
    deleteComment(commentId: number, requester: { id: number, isAdmin: boolean }): void {
        const comment = this.postRepository.findCommentById(commentId);
        if (!comment) {
            throw new NotFoundError('commentNotFound');
        }
        const post = this.postRepository.findPostById(comment.postId);
        if (!post) {
            throw new NotFoundError('postNotFound');
        }

        const isCommentAuthor = comment.authorId === requester.id;
        const isPostAuthor = post.authorId === requester.id;
        const canModerate = this.isClubModerator(post.clubId, requester.id);

        if (!isCommentAuthor && !isPostAuthor && !requester.isAdmin && !canModerate) {
            throw new ForbiddenError('commentDeleteForbidden');
        }

        this.postRepository.deleteComment(commentId);
    }

    likeComment(commentId: number, userId: number): void {
        this.requireComment(commentId);
        this.postRepository.addCommentLike(commentId, userId);
    }

    unlikeComment(commentId: number, userId: number): void {
        this.requireComment(commentId);
        this.postRepository.removeCommentLike(commentId, userId);
    }

    private requireComment(commentId: number): void {
        if (!this.postRepository.findCommentById(commentId)) {
            throw new NotFoundError('commentNotFound');
        }
    }

    likePost(postId: number, userId: number): void {
        const post = this.postRepository.findPostById(postId);
        if (!post) {
            throw new NotFoundError('postNotFound');
        }
        this.postRepository.addLike(postId, userId);
    }

    unlikePost(postId: number, userId: number): void {
        const post = this.postRepository.findPostById(postId);
        if (!post) {
            throw new NotFoundError('postNotFound');
        }
        this.postRepository.removeLike(postId, userId);
    }
}
