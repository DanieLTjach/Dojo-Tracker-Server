const express = require('express');
const router = express.Router();
const AchievementsController = require('./AchievementsController');

router.post('/new', AchievementsController.newAchievement);
router.post('/grant', AchievementsController.grantAchievement);
router.get('/list', AchievementsController.listAchievements);
router.get('/user_list', AchievementsController.userAchievements);

module.exports = router;