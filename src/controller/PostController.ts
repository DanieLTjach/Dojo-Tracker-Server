import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
    commentActionSchema,
    createCommentSchema,
    createPostSchema,
    getClubPostsSchema,
    getCommentsSchema,
    getGamePostsSchema,
    getPostByIdSchema,
    getUserPostsSchema,
    postActionSchema,
    updateCommentSchema,
    updatePostSchema,
} from '../schema/PostSchemas.ts';
import { PostService } from '../service/PostService.ts';
import { UserService } from '../service/UserService.ts';

export class PostController {
    private postService: PostService;
    private userService: UserService;

    constructor(
        postService: PostService = new PostService(),
        userService: UserService = new UserService()
    ) {
        this.postService = postService;
        this.userService = userService;
    }

    createPost(req: Request, res: Response) {
        const { body } = createPostSchema.parse(req);
        const post = this.postService.createPost(req.user!.userId, body);
        return res.status(StatusCodes.CREATED).json(post);
    }

    getPostById(req: Request, res: Response) {
        const { params: { id } } = getPostByIdSchema.parse(req);
        const post = this.postService.getPostById(id, req.user?.userId);
        return res.status(StatusCodes.OK).json(post);
    }

    getUserPosts(req: Request, res: Response) {
        const { params: { id } } = getUserPostsSchema.parse(req);
        const posts = this.postService.getUserPosts(id, req.user?.userId);
        return res.status(StatusCodes.OK).json(posts);
    }

    getClubPosts(req: Request, res: Response) {
        const { params: { id } } = getClubPostsSchema.parse(req);
        const posts = this.postService.getClubPosts(id, req.user?.userId);
        return res.status(StatusCodes.OK).json(posts);
    }

    getGamePosts(req: Request, res: Response) {
        const { params: { gameId } } = getGamePostsSchema.parse(req);
        const posts = this.postService.getGamePosts(gameId, req.user?.userId);
        return res.status(StatusCodes.OK).json(posts);
    }

    updatePost(req: Request, res: Response) {
        const { params: { id }, body } = updatePostSchema.parse(req);
        const post = this.postService.updatePost(id, body, { id: req.user!.userId });
        return res.status(StatusCodes.OK).json(post);
    }

    deletePost(req: Request, res: Response) {
        const { params: { id } } = postActionSchema.parse(req);
        const user = this.userService.getUserById(req.user!.userId);
        this.postService.deletePost(id, { id: user.id, isAdmin: user.isAdmin });
        return res.status(StatusCodes.NO_CONTENT).send();
    }

    getComments(req: Request, res: Response) {
        const { params: { id } } = getCommentsSchema.parse(req);
        const comments = this.postService.getComments(id, req.user?.userId);
        return res.status(StatusCodes.OK).json(comments);
    }

    createComment(req: Request, res: Response) {
        const { params: { id }, body } = createCommentSchema.parse(req);
        const comment = this.postService.createComment(id, req.user!.userId, body);
        return res.status(StatusCodes.CREATED).json(comment);
    }

    updateComment(req: Request, res: Response) {
        const { params: { commentId }, body } = updateCommentSchema.parse(req);
        const comment = this.postService.updateComment(commentId, body, { id: req.user!.userId });
        return res.status(StatusCodes.OK).json(comment);
    }

    deleteComment(req: Request, res: Response) {
        const { params: { commentId } } = commentActionSchema.parse(req);
        const user = this.userService.getUserById(req.user!.userId);
        this.postService.deleteComment(commentId, { id: user.id, isAdmin: user.isAdmin });
        return res.status(StatusCodes.NO_CONTENT).send();
    }

    likeComment(req: Request, res: Response) {
        const { params: { commentId } } = commentActionSchema.parse(req);
        this.postService.likeComment(commentId, req.user!.userId);
        return res.status(StatusCodes.OK).json({ success: true });
    }

    unlikeComment(req: Request, res: Response) {
        const { params: { commentId } } = commentActionSchema.parse(req);
        this.postService.unlikeComment(commentId, req.user!.userId);
        return res.status(StatusCodes.OK).json({ success: true });
    }

    likePost(req: Request, res: Response) {
        const { params: { id } } = postActionSchema.parse(req);
        this.postService.likePost(id, req.user!.userId);
        return res.status(StatusCodes.OK).json({ success: true });
    }

    unlikePost(req: Request, res: Response) {
        const { params: { id } } = postActionSchema.parse(req);
        this.postService.unlikePost(id, req.user!.userId);
        return res.status(StatusCodes.OK).json({ success: true });
    }
}
