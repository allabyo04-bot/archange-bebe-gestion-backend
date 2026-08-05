const express = require('express');
const router = express.Router();
const { recevoirWebhookJeko } = require('../controllers/webhookJekoController');

router.post('/', recevoirWebhookJeko);

module.exports = router;
