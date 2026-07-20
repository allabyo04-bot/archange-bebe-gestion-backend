const express = require('express');
const router = express.Router();
const { listerVentesCredit, ajouterReglement } = require('../controllers/creditController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('ADMIN', 'CAISSIER'), listerVentesCredit);
router.post('/:venteId/reglements', requireAuth, requireRole('ADMIN', 'CAISSIER'), ajouterReglement);

module.exports = router;