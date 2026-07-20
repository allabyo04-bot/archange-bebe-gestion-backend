const express = require('express');
const router = express.Router();
const { listerClients, creerClient, obtenirClient, modifierClient } = require('../controllers/clientController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, listerClients);
router.post('/', requireAuth, creerClient);
router.get('/:id', requireAuth, obtenirClient);
router.put('/:id', requireAuth, modifierClient);

module.exports = router;
