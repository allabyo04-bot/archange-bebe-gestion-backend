const express = require('express');
const router = express.Router();
const { listerRoles, creerRole, modifierPermission, supprimerRole } = require('../controllers/roleController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('ADMIN'), listerRoles);
router.post('/', requireAuth, requireRole('ADMIN'), creerRole);
router.put('/:id/permissions', requireAuth, requireRole('ADMIN'), modifierPermission);
router.delete('/:id', requireAuth, requireRole('ADMIN'), supprimerRole);

module.exports = router;