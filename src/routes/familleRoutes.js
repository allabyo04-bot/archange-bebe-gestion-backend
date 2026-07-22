const express = require('express');
const router = express.Router();
const {
  listerFamilles, creerFamille, creerSousFamille, modifierFamille, modifierSousFamille,
} = require('../controllers/familleController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, listerFamilles);
router.post('/', requireAuth, requireRole('ADMIN'), creerFamille);
router.put('/:id', requireAuth, requireRole('ADMIN'), modifierFamille);
router.post('/:familleId/sous-familles', requireAuth, requireRole('ADMIN'), creerSousFamille);
router.put('/:familleId/sous-familles/:id', requireAuth, requireRole('ADMIN'), modifierSousFamille);

module.exports = router;
