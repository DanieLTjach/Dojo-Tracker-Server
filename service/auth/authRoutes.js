const express = require('express');
const router = express.Router();
const authController = require('./authController');

router.post('/register', authController.register);

module.exports = router;