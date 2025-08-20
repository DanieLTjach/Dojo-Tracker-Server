const express = require('express');
const router = express.Router();
const EventController = require('./EventController');

router.post('/add', EventController.add);
router.post('/edit', EventController.edit);
router.post('/remove', EventController.remove);
router.get('/list', EventController.list);

module.exports = router;