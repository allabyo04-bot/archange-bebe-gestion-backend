const express = require('express');
const router = express.Router();
const {
  listerDenominations, listerToutesDenominations, creerDenomination, modifierDenomination,
  obtenirCarteCadeau, activerCarteCadeau, listerCartesCadeaux,
} = require('../controllers/carteCadeauController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/denominations', requireAuth, listerDenominations);
router.get('/denominations/toutes', requireAuth, requireRole('ADMIN'), listerToutesDenominations);
router.post('/denominations', requireAuth, requireRole('ADMIN'), creerDenomination);
router.put('/denominations/:id', requireAuth, requireRole('ADMIN'), modifierDenomination);
router.get('/', requireAuth, listerCartesCadeaux);
router.get('/:codeBarre', requireAuth, obtenirCarteCadeau);
router.post('/activer', requireAuth, activerCarteCadeau);

module.exports = router;