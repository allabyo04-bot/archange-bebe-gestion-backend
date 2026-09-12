const express = require('express');
const router = express.Router();
const {
  listerUtilisateurs, creerUtilisateur, modifierUtilisateur, reinitialiserPin,
} = require('../controllers/utilisateurController');
const { rapportActivite } = require('../controllers/rapportActiviteController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('ADMIN'), listerUtilisateurs);
router.post('/', requireAuth, requireRole('ADMIN'), creerUtilisateur);
router.put('/:id', requireAuth, requireRole('ADMIN'), modifierUtilisateur);
router.post('/:id/reinitialiser-pin', requireAuth, requireRole('ADMIN'), reinitialiserPin);
router.get('/:id/rapport-activite', requireAuth, requireRole('ADMIN'), rapportActivite);

module.exports = router;