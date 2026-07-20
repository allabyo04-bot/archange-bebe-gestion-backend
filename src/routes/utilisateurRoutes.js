const express = require('express');
const router = express.Router();
const {
  listerUtilisateurs, creerUtilisateur, modifierUtilisateur, reinitialiserPin,
} = require('../controllers/utilisateurController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('ADMIN'), listerUtilisateurs);
router.post('/', requireAuth, requireRole('ADMIN'), creerUtilisateur);
router.put('/:id', requireAuth, requireRole('ADMIN'), modifierUtilisateur);
router.post('/:id/reinitialiser-pin', requireAuth, requireRole('ADMIN'), reinitialiserPin);

module.exports = router;