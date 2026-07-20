const express = require('express');
const router = express.Router();
const { listerAvoirs, obtenirAvoirParReference } = require('../controllers/retourController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('ADMIN', 'CAISSIER'), listerAvoirs);
router.get('/:reference', requireAuth, requireRole('ADMIN', 'CAISSIER'), obtenirAvoirParReference);

module.exports = router;