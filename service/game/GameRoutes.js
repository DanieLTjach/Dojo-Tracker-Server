const express = require('express');
const router = express.Router();
const GameController = require('./GameController');

router.post('/add', GameController.add);
router.post('/edit', GameController.edit);
router.post('/remove', GameController.remove);
router.get('/list', GameController.list);
router.get('/get', GameController.get);

module.exports = router;