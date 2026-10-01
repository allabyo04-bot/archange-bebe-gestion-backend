const express = require('express');
const router = express.Router();
const {
  listerArticles, rechercherArticle, creerArticle, modifierArticle, genererCodeBarre,
  listerCodesAImprimer, imprimerEtiquettes, uploaderPhoto, supprimerPhoto, definirPhotoPrincipale,
  deplacerGroupe, stockParDepot,
} = require('../controllers/articleController');
const { requireAuth, requireRole, requireModule, requireUnDesModules } = require('../middleware/auth');
const prisma = require('../lib/prisma');

// Un compte avec le module ARTICLES (ex. gestionnaire de stock) peut CRÉER des articles,
// mais ne modifie pas l'existant. Exception : il peut compléter les articles qu'il a
// lui-même créés (photos, code-barre généré), sinon il ne pourrait pas finir sa fiche.
// Les admins passent toujours.
async function requireAdminOuCreateur(req, res, next) {
  if (req.user?.role === 'ADMIN') return next();
  const article = await prisma.article.findUnique({
    where: { id: Number(req.params.id) }, select: { creeParId: true },
  });
  if (!article) return res.status(404).json({ error: 'Article introuvable.' });
  if (article.creeParId !== req.user.id) {
    return res.status(403).json({ error: "Seul un administrateur peut modifier un article que vous n'avez pas créé." });
  }
  next();
}
const upload = require('../middleware/upload');

router.get('/', requireAuth, listerArticles);
router.get('/recherche', requireAuth, rechercherArticle);
// Impression d'étiquettes : aussi utilisée depuis l'écran Stock (après réception, historique).
router.get('/a-imprimer', requireAuth, requireUnDesModules('ARTICLES', 'STOCK'), listerCodesAImprimer);
router.post('/a-imprimer/etiquettes', requireAuth, requireUnDesModules('ARTICLES', 'STOCK'), imprimerEtiquettes);
router.post('/', requireAuth, requireModule('ARTICLES'), creerArticle);
router.put('/deplacer-groupe', requireAuth, requireRole('ADMIN'), deplacerGroupe);
router.put('/:id', requireAuth, requireRole('ADMIN'), modifierArticle);
router.get('/:id/stock', requireAuth, stockParDepot);
router.post('/:id/generer-code-barre', requireAuth, requireModule('ARTICLES'), requireAdminOuCreateur, genererCodeBarre);
router.post('/:id/photo', requireAuth, requireModule('ARTICLES'), requireAdminOuCreateur, upload.single('photo'), uploaderPhoto);
router.delete('/:id/photos/:photoId', requireAuth, requireModule('ARTICLES'), requireAdminOuCreateur, supprimerPhoto);
router.put('/:id/photos/:photoId/principale', requireAuth, requireModule('ARTICLES'), requireAdminOuCreateur, definirPhotoPrincipale);

module.exports = router;