const express = require('express');
const router = express.Router();
const {
  margeParProduit, recapBoutique, meilleurVendeur,
  parDate, parModePaiement, parType, fermetureCaisse,
  exporterMargeCsv, exporterVentesCsv, exporterDepensesCsv,
} = require('../controllers/etatController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/marge-produits', requireAuth, requireRole('ADMIN'), margeParProduit);
router.get('/marge-produits/export.csv', requireAuth, requireRole('ADMIN'), exporterMargeCsv);
router.get('/recap-boutique', requireAuth, requireRole('ADMIN'), recapBoutique);
router.get('/meilleur-vendeur', requireAuth, meilleurVendeur);
router.get('/par-date', requireAuth, parDate);
router.get('/par-mode-paiement', requireAuth, parModePaiement);
router.get('/par-type', requireAuth, parType);
router.get('/fermeture-caisse', requireAuth, fermetureCaisse);
router.get('/ventes/export.csv', requireAuth, requireRole('ADMIN'), exporterVentesCsv);
router.get('/depenses/export.csv', requireAuth, requireRole('ADMIN'), exporterDepensesCsv);

module.exports = router;
