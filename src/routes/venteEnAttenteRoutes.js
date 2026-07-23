const express = require('express');
const router = express.Router();
const {
  listerVentesEnAttente, creerVenteEnAttente, supprimerVenteEnAttente,
} = require('../controllers/venteEnAttenteController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, listerVentesEnAttente);
router.post('/', requireAuth, creerVenteEnAttente);
router.delete('/:id', requireAuth, supprimerVenteEnAttente);

module.exports = router;
