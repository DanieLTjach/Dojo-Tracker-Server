const express = require('express');
const router = express.Router();
const ClubController = require('./ClubController');

router.post('/add', ClubController.add);
router.post('/edit', ClubController.edit);
router.post('/remove', ClubController.remove);
router.get('/list', ClubController.list);
router.get('/get', ClubController.get);

module.exports = router;