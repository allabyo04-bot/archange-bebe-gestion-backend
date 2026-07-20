const express = require('express');
const router = express.Router();
const { listerFamilles, creerFamille, creerSousFamille } = require('../controllers/familleController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, listerFamilles);
router.post('/', requireAuth, requireRole('ADMIN'), creerFamille);
router.post('/:familleId/sous-familles', requireAuth, requireRole('ADMIN'), creerSousFamille);

module.exports = router;
