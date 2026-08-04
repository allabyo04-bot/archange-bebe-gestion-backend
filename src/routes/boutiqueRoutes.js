const express = require('express');
const router = express.Router();
const {
  listerProduits, obtenirProduit, listerFamillesPubliques, listerLieuxRetrait,
  inscription, connexion, authClientOptionnelle, monCompte, mesCommandes,
  creerCommande, listerCommandesAdmin, modifierStatutCommande,
} = require('../controllers/boutiqueController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Catalogue — public, aucune authentification requise
router.get('/produits', listerProduits);
router.get('/produits/:id', obtenirProduit);
router.get('/familles', listerFamillesPubliques);
router.get('/lieux', listerLieuxRetrait);

// Compte client
router.post('/compte/inscription', inscription);
router.post('/compte/connexion', connexion);
router.get('/compte/moi', authClientOptionnelle, monCompte);
router.get('/compte/mes-commandes', authClientOptionnelle, mesCommandes);

// Commande — invité ou compte (le token client est optionnel ici)
router.post('/commandes', authClientOptionnelle, creerCommande);

// Admin — réservé au personnel connecté (staff), distinct du token client
router.get('/admin/commandes', requireAuth, listerCommandesAdmin);
router.put('/admin/commandes/:id', requireAuth, requireRole('ADMIN'), modifierStatutCommande);

module.exports = router;
