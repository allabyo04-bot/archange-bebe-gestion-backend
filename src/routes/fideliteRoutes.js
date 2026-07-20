const express = require('express');
const router = express.Router();
const { listerRecompenses, definirRecompense, marquerUtilisee } = require('../controllers/fideliteController');
const { requireAuth, requireModule } = require('../middleware/auth');

router.get('/', requireAuth, requireModule('RAPPORTS'), listerRecompenses);
router.put('/:id', requireAuth, requireModule('RAPPORTS'), definirRecompense);
router.post('/:id/marquer-utilisee', requireAuth, requireModule('RAPPORTS'), marquerUtilisee);

module.exports = router;