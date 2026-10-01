const express = require('express');
const router = express.Router();
const {
  listerArticles, rechercherArticle, creerArticle, modifierArticle, genererCodeBarre,
  listerCodesAImprimer, imprimerEtiquettes, uploaderPhoto, supprimerPhoto, definirPhotoPrincipale,
  deplacerGroupe, stockParDepot,
} = require('../controllers/articleController');
const { requireAuth, requireRole, requireUnDesModules } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/', requireAuth, listerArticles);
router.get('/recherche', requireAuth, rechercherArticle);
// Impression d'étiquettes : aussi utilisée depuis l'écran Stock (après réception, historique).
router.get('/a-imprimer', requireAuth, requireUnDesModules('ARTICLES', 'STOCK'), listerCodesAImprimer);
router.post('/a-imprimer/etiquettes', requireAuth, requireUnDesModules('ARTICLES', 'STOCK'), imprimerEtiquettes);
router.post('/', requireAuth, requireRole('ADMIN'), creerArticle);
router.put('/deplacer-groupe', requireAuth, requireRole('ADMIN'), deplacerGroupe);
router.put('/:id', requireAuth, requireRole('ADMIN'), modifierArticle);
router.get('/:id/stock', requireAuth, stockParDepot);
router.post('/:id/generer-code-barre', requireAuth, requireRole('ADMIN'), genererCodeBarre);
router.post('/:id/photo', requireAuth, requireRole('ADMIN'), upload.single('photo'), uploaderPhoto);
router.delete('/:id/photos/:photoId', requireAuth, requireRole('ADMIN'), supprimerPhoto);
router.put('/:id/photos/:photoId/principale', requireAuth, requireRole('ADMIN'), definirPhotoPrincipale);

module.exports = router;