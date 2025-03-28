const express = require('express');
const router = express.Router();
const UserController = require('./UserController');

router.post('/register', UserController.register);
router.post('/edit', UserController.edit);
router.post('/remove', UserController.remove_user);
router.post('/activate', UserController.activate_user);
router.get('/get', UserController.get_user);

module.exports = router;