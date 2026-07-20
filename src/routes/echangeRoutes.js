const express = require('express');
const router = express.Router();
const { creerEchange, listerEchanges } = require('../controllers/echangeController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.post('/', requireAuth, requireRole('ADMIN', 'CAISSIER'), creerEchange);
router.get('/', requireAuth, requireRole('ADMIN', 'CAISSIER'), listerEchanges);

module.exports = router;