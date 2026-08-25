import { Router } from 'express';
import { PostController } from '../controller/PostController.ts';
import { withTransaction } from '../db/TransactionManagement.ts';
import { optionalAuth, requireAuth } from '../middleware/AuthMiddleware.ts';

const router = Router();
const postController = new PostController();

// CRUD on posts
router.post('/posts', requireAuth, withTransaction((req, res) => postController.createPost(req, res)));
router.get('/posts/:id', optionalAuth, (req, res) => postController.getPostById(req, res));
router.delete('/posts/:id', requireAuth, withTransaction((req, res) => postController.deletePost(req, res)));

// Likes
router.post('/posts/:id/like', requireAuth, withTransaction((req, res) => postController.likePost(req, res)));
router.delete('/posts/:id/like', requireAuth, withTransaction((req, res) => postController.unlikePost(req, res)));

// User & Club posts feeds
router.get('/users/:id/posts', optionalAuth, (req, res) => postController.getUserPosts(req, res));
router.get('/clubs/:id/posts', optionalAuth, (req, res) => postController.getClubPosts(req, res));

export default router;
