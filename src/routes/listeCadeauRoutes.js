const express = require('express');
const router = express.Router();
const {
  creerListeCadeau, listerListesCadeaux, consulterListePublique, offrirDepuisWeb, offrirParTelephone,
  listerOffresEnAttente, confirmerOffre, rejeterOffre,
} = require('../controllers/listeCadeauController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Routes internes (personnel en boutique)
router.get('/', requireAuth, listerListesCadeaux);
router.post('/', requireAuth, creerListeCadeau);
router.post('/:codeAcces/offrir-telephone', requireAuth, offrirParTelephone);

// Validation des offres déclarées à distance (ADMIN uniquement — Victoria)
router.get('/offres-en-attente', requireAuth, requireRole('ADMIN'), listerOffresEnAttente);
router.post('/offres/:id/confirmer', requireAuth, requireRole('ADMIN'), confirmerOffre);
router.post('/offres/:id/rejeter', requireAuth, requireRole('ADMIN'), rejeterOffre);

// Routes publiques (accessibles via le lien partagé, sans compte)
router.get('/publique/:codeAcces', consulterListePublique);
router.post('/publique/:codeAcces/offrir', offrirDepuisWeb);

module.exports = router;
