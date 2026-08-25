import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import {
    createPostSchema,
    getClubPostsSchema,
    getPostByIdSchema,
    getUserPostsSchema,
    postActionSchema,
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

    deletePost(req: Request, res: Response) {
        const { params: { id } } = postActionSchema.parse(req);
        const user = this.userService.getUserById(req.user!.userId);
        this.postService.deletePost(id, { id: user.id, isAdmin: user.isAdmin });
        return res.status(StatusCodes.NO_CONTENT).send();
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
