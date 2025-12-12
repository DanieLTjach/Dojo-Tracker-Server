import { Router } from 'express';
import { AchievementsController } from './AchievementsController.js';

const router = Router();
const achievementsController = new AchievementsController();

router.post('/new', (req, res) => achievementsController.newAchievement(req, res));
router.post('/grant', (req, res) => achievementsController.grantAchievement(req, res));
router.get('/list', (req, res) => achievementsController.listAchievements(req, res));
router.get('/user_list', (req, res) => achievementsController.userAchievements(req, res));

export default router;