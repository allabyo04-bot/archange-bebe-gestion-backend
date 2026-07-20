const express = require('express');
const router = express.Router();
const { listerVendeurs, listerTousVendeurs, creerVendeur, modifierVendeur } = require('../controllers/vendeurController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, listerVendeurs);
router.get('/tous', requireAuth, requireRole('ADMIN'), listerTousVendeurs);
router.post('/', requireAuth, requireRole('ADMIN'), creerVendeur);
router.put('/:id', requireAuth, requireRole('ADMIN'), modifierVendeur);

module.exports = router;