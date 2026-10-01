const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { listerLieux, creerLieu, modifierLieu, stockParLieu } = require('../controllers/lieuController');
const { creerReception, listerReceptions } = require('../controllers/receptionController');
const { creerTransfert, listerTransferts } = require('../controllers/transfertController');
const { previsualiserImport, confirmerImport } = require('../controllers/importStockController');
const { listerMouvements } = require('../controllers/mouvementController');
const { previsualiserInventaire, appliquerInventaire } = require('../controllers/inventaireController');
const { requireAuth, requireRole, requireModule } = require('../middleware/auth');

// Les opérations de stock (réception, transfert, inventaire, import) suivent désormais
// le module STOCK de l'écran « Rôles » au lieu d'être réservées aux administrateurs,
// pour qu'un profil « Gestionnaire de stock » puisse faire son travail. La création et
// la modification des dépôts/boutiques restent réservées aux administrateurs.

router.get('/lieux', requireAuth, listerLieux);
router.post('/lieux', requireAuth, requireRole('ADMIN'), creerLieu);
router.put('/lieux/:id', requireAuth, requireRole('ADMIN'), modifierLieu);
router.get('/lieux/:id/stock', requireAuth, stockParLieu);
router.get('/receptions', requireAuth, listerReceptions);
router.post('/receptions', requireAuth, requireModule('STOCK'), creerReception);
router.get('/transferts', requireAuth, listerTransferts);
router.post('/transferts', requireAuth, requireModule('STOCK'), creerTransfert);
router.get('/mouvements', requireAuth, listerMouvements);
router.get('/inventaire', requireAuth, requireModule('STOCK'), previsualiserInventaire);
router.post('/inventaire', requireAuth, requireModule('STOCK'), appliquerInventaire);
router.post('/import/previsualiser', requireAuth, requireModule('STOCK'), upload.single('fichier'), previsualiserImport);
router.post('/import/confirmer', requireAuth, requireModule('STOCK'), confirmerImport);

module.exports = router;