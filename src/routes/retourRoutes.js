const express = require('express');
const router = express.Router();
const { rechercherVenteOrigine, creerRetour } = require('../controllers/retourController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/ventes', requireAuth, requireRole('ADMIN', 'CAISSIER'), rechercherVenteOrigine);
router.post('/', requireAuth, requireRole('ADMIN', 'CAISSIER'), creerRetour);

module.exports = router;