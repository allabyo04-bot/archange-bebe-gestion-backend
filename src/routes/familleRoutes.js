const express = require('express');
const router = express.Router();
const {
  listerFamilles, creerFamille, creerSousFamille, modifierFamille, modifierSousFamille,
} = require('../controllers/familleController');
const { requireAuth, requireRole, requireModule } = require('../middleware/auth');

// Création de famille / sous-famille ouverte au module ARTICLES (pour qu'un gestionnaire
// de stock puisse classer un nouvel article) ; la modification reste réservée aux admins.

router.get('/', requireAuth, listerFamilles);
router.post('/', requireAuth, requireModule('ARTICLES'), creerFamille);
router.put('/:id', requireAuth, requireRole('ADMIN'), modifierFamille);
router.post('/:familleId/sous-familles', requireAuth, requireModule('ARTICLES'), creerSousFamille);
router.put('/:familleId/sous-familles/:id', requireAuth, requireRole('ADMIN'), modifierSousFamille);

module.exports = router;
