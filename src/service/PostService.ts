import { BadRequestError, ForbiddenError, NotFoundError } from '../error/BaseErrors.ts';
import type { CreatePostDTO, Post } from '../model/PostModels.ts';
import { ClubMembershipRepository } from '../repository/ClubMembershipRepository.ts';
import { ClubRepository } from '../repository/ClubRepository.ts';
import { PostRepository } from '../repository/PostRepository.ts';

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

    deletePost(postId: number, requester: { id: number, isAdmin: boolean }): void {
        const post = this.postRepository.findPostById(postId);
        if (!post) {
            throw new NotFoundError('postNotFound');
        }

        const isAuthor = post.authorId === requester.id;
        const isAdmin = requester.isAdmin;
        let isClubModerator = false;

        if (post.clubId != null) {
            const membership = this.clubMembershipRepository.findMembership(post.clubId, requester.id);
            if (
                membership && membership.status === 'ACTIVE' &&
                (membership.role === 'OWNER' || membership.role === 'MODERATOR')
            ) {
                isClubModerator = true;
            }
        }

        if (!isAuthor && !isAdmin && !isClubModerator) {
            throw new ForbiddenError('postDeleteForbidden');
        }

        this.postRepository.deletePost(postId);
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
