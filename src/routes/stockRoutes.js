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
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/lieux', requireAuth, listerLieux);
router.post('/lieux', requireAuth, requireRole('ADMIN'), creerLieu);
router.put('/lieux/:id', requireAuth, requireRole('ADMIN'), modifierLieu);
router.get('/lieux/:id/stock', requireAuth, stockParLieu);
router.get('/receptions', requireAuth, listerReceptions);
router.post('/receptions', requireAuth, requireRole('ADMIN'), creerReception);
router.get('/transferts', requireAuth, listerTransferts);
router.post('/transferts', requireAuth, requireRole('ADMIN'), creerTransfert);
router.get('/mouvements', requireAuth, listerMouvements);
router.get('/inventaire', requireAuth, requireRole('ADMIN'), previsualiserInventaire);
router.post('/inventaire', requireAuth, requireRole('ADMIN'), appliquerInventaire);
router.post('/import/previsualiser', requireAuth, requireRole('ADMIN'), upload.single('fichier'), previsualiserImport);
router.post('/import/confirmer', requireAuth, requireRole('ADMIN'), confirmerImport);

module.exports = router;