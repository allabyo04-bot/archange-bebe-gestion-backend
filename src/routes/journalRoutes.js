const express = require('express');
const router = express.Router();
const { listerJournal } = require('../controllers/journalController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('ADMIN'), listerJournal);

module.exports = router;