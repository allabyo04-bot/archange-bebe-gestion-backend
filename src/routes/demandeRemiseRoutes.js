const express = require('express');
const router = express.Router();
const {
  listerDemandesRemise, approuverDemandeRemise, refuserDemandeRemise,
} = require('../controllers/demandeRemiseController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('ADMIN'), listerDemandesRemise);
router.post('/:id/approuver', requireAuth, requireRole('ADMIN'), approuverDemandeRemise);
router.post('/:id/refuser', requireAuth, requireRole('ADMIN'), refuserDemandeRemise);

module.exports = router;
