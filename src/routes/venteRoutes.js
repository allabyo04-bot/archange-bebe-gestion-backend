const express = require('express');
const router = express.Router();
const {
  creerVente, annulerVente, listerVentes,
  demanderAnnulation, listerDemandesAnnulation, rejeterAnnulation,
} = require('../controllers/venteController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, listerVentes);
router.get('/demandes-annulation', requireAuth, requireRole('ADMIN'), listerDemandesAnnulation);
router.post('/', requireAuth, creerVente);
router.post('/:id/demander-annulation', requireAuth, demanderAnnulation);
router.post('/:id/rejeter-annulation', requireAuth, requireRole('ADMIN'), rejeterAnnulation);
router.post('/:id/annuler', requireAuth, requireRole('ADMIN'), annulerVente);

module.exports = router;