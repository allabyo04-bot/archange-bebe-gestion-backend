const express = require('express');
const router = express.Router();
const {
  listerArticles, rechercherArticle, creerArticle, modifierArticle, genererCodeBarre,
  listerCodesAImprimer, imprimerEtiquettes, uploaderPhoto,
} = require('../controllers/articleController');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/', requireAuth, listerArticles);
router.get('/recherche', requireAuth, rechercherArticle);
router.get('/a-imprimer', requireAuth, requireRole('ADMIN'), listerCodesAImprimer);
router.post('/a-imprimer/etiquettes', requireAuth, requireRole('ADMIN'), imprimerEtiquettes);
router.post('/', requireAuth, requireRole('ADMIN'), creerArticle);
router.put('/:id', requireAuth, requireRole('ADMIN'), modifierArticle);
router.post('/:id/generer-code-barre', requireAuth, requireRole('ADMIN'), genererCodeBarre);
router.post('/:id/photo', requireAuth, requireRole('ADMIN'), upload.single('photo'), uploaderPhoto);

module.exports = router;