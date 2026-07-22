const express = require('express');
const router = express.Router();
const { listerRoles, creerRole, modifierPermission, modifierPlafondRemise, supprimerRole } = require('../controllers/roleController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('ADMIN'), listerRoles);
router.post('/', requireAuth, requireRole('ADMIN'), creerRole);
router.put('/:id/permissions', requireAuth, requireRole('ADMIN'), modifierPermission);
router.put('/:id/plafond-remise', requireAuth, requireRole('ADMIN'), modifierPlafondRemise);
router.delete('/:id', requireAuth, requireRole('ADMIN'), supprimerRole);

module.exports = router;