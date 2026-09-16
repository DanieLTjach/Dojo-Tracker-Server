import { BadRequestError, ForbiddenError, NotFoundError } from '../error/BaseErrors.ts';
import type {
    CreateCommentDTO,
    CreatePostDTO,
    CreatePostImageDTO,
    Post,
    PostComment,
    UpdatePostDTO,
} from '../model/PostModels.ts';
import { ClubMembershipRepository } from '../repository/ClubMembershipRepository.ts';
import { ClubRepository } from '../repository/ClubRepository.ts';
import { GameRepository } from '../repository/GameRepository.ts';
import { PostRepository } from '../repository/PostRepository.ts';
import { UserRepository } from '../repository/UserRepository.ts';
import config from '../../config/config.ts';
import { t } from '../i18n/index.ts';
import { resolveClubLocale } from '../util/LocaleResolver.ts';
import { escapeTelegramHtml, userProfileLink } from '../util/TelegramHtmlUtil.ts';
import LogService from './LogService.ts';
import telegramMessageService from './TelegramMessageService.ts';

export const COMMENT_MAX_LENGTH = 500;
export const MAX_POST_IMAGES = 4;

export class PostService {
    private postRepository: PostRepository;
    private clubRepository: ClubRepository;
    private clubMembershipRepository: ClubMembershipRepository;
    private gameRepository: GameRepository;
    private userRepository: UserRepository;

    constructor(
        postRepository: PostRepository = new PostRepository(),
        clubRepository: ClubRepository = new ClubRepository(),
        clubMembershipRepository: ClubMembershipRepository = new ClubMembershipRepository(),
        gameRepository: GameRepository = new GameRepository(),
        userRepository: UserRepository = new UserRepository()
    ) {
        this.postRepository = postRepository;
        this.clubRepository = clubRepository;
        this.clubMembershipRepository = clubMembershipRepository;
        this.gameRepository = gameRepository;
        this.userRepository = userRepository;
    }

    private validateImages(images: CreatePostImageDTO[] | undefined): void {
        if (!images || !Array.isArray(images) || images.length === 0) {
            throw new BadRequestError('postMustHaveImages');
        }
        if (images.length > MAX_POST_IMAGES) {
            throw new BadRequestError('postMaxFourImages');
        }
        for (const img of images) {
            if (!img.url || typeof img.url !== 'string') {
                throw new BadRequestError('postInvalidImageUrl');
            }
        }
    }

    createPost(authorId: number, dto: CreatePostDTO): Post {
        this.validateImages(dto.images);
        if (dto.text && dto.text.length > 280) {
            throw new BadRequestError('postTextTooLong');
        }
        if (dto.clubId != null) {
            const club = this.clubRepository.findClubById(dto.clubId);
            if (!club) {
                throw new NotFoundError('clubNotFound');
            }
        }
        if (dto.roundNumber != null && dto.gameId == null) {
            throw new BadRequestError('roundRequiresGame');
        }
        if (dto.gameId != null) {
            const game = this.gameRepository.findGameById(dto.gameId);
            if (!game) {
                throw new NotFoundError('gameNotFound');
            }
            const players = this.gameRepository.findGamePlayersByGameId(dto.gameId);
            const isParticipant = players.some(p => p.userId === authorId);
            if (!isParticipant) {
                throw new ForbiddenError('notGameParticipant');
            }
            if (dto.roundNumber != null) {
                const rounds = this.gameRepository.findGameRoundsByGameId(dto.gameId);
                const roundExists = rounds.some(r => r.roundNumber === dto.roundNumber);
                if (!roundExists) {
                    throw new NotFoundError('gameRoundNotFound');
                }
            }
        }

        const postId = this.postRepository.createPost(authorId, dto);
        const createdPost = this.postRepository.findPostById(postId, authorId);
        if (!createdPost) {
            throw new NotFoundError('postNotFound');
        }

        if (dto.shareToTelegram) {
            // Deliberately not awaited: the post is saved and the response must
            // not wait on Telegram, nor fail if Telegram is down.
            void this.sharePostToTelegram(createdPost, authorId);
        }

        return createdPost;
    }

    /**
     * Publishes a post to the Telegram group of the club it was posted to.
     *
     * A post carrying a game goes to the club's RATING topic, where the rest of
     * the game traffic lives; anything else goes to MAIN, alongside the polls.
     * A post with no club has no group to go to and is skipped.
     */
    private async sharePostToTelegram(post: Post, authorId: number): Promise<void> {
        try {
            if (post.clubId == null) {
                return;
            }

            const club = this.clubRepository.findClubById(post.clubId);
            if (!club) {
                return;
            }

            const topics = this.clubRepository.getClubTelegramTopics(post.clubId);
            const topic = post.gameId != null ? topics?.rating : topics?.main;
            if (!topic) {
                return;
            }

            const author = this.userRepository.findUserById(authorId);
            if (!author) {
                return;
            }

            const locale = resolveClubLocale(club);
            const header = t('telegram.post.published', locale, {
                author: userProfileLink(config.botUrl, author.id, author.name),
            });
            const body = post.text?.trim();
            // The caption is HTML, and `body` is user-authored - escape it.
            const caption = body
                ? `${header}\n\n${escapeTelegramHtml(body)}`
                : header;

            const imageUrls = post.images.map(image => image.url).filter(Boolean);
            await telegramMessageService.sendPhotos(imageUrls, caption, topic);
        } catch (error) {
            // Sharing is a side effect of an already-saved post; never surface it.
            LogService.logError(`Error sharing post ${post.id} to Telegram`, error);
        }
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

    getGamePosts(gameId: number, currentUserId?: number): Post[] {
        const game = this.gameRepository.findGameById(gameId);
        if (!game) {
            throw new NotFoundError('gameNotFound');
        }
        return this.postRepository.findPostsByGameId(gameId, currentUserId);
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
        if (dto.images !== undefined) {
            // A post is a photo post - the same invariant createPost enforces.
            // Emptying the list is a delete, not an edit, so it is refused here
            // rather than silently leaving a post with nothing to show.
            this.validateImages(dto.images);
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
