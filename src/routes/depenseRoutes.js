const express = require('express');
const router = express.Router();
const {
  listerDepenses, creerDepense, listerCategories, creerCategorie, modifierCategorie, supprimerCategorie, syntheseBudget,
  creerSousCategorie, modifierSousCategorie, supprimerSousCategorie,
} = require('../controllers/depenseController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/categories', requireAuth, listerCategories);
router.post('/categories', requireAuth, requireRole('ADMIN'), creerCategorie);
router.put('/categories/:id', requireAuth, requireRole('ADMIN'), modifierCategorie);
router.delete('/categories/:id', requireAuth, requireRole('ADMIN'), supprimerCategorie);
router.post('/categories/:categorieId/sous-categories', requireAuth, requireRole('ADMIN'), creerSousCategorie);
router.put('/sous-categories/:id', requireAuth, requireRole('ADMIN'), modifierSousCategorie);
router.delete('/sous-categories/:id', requireAuth, requireRole('ADMIN'), supprimerSousCategorie);
router.get('/budget', requireAuth, requireRole('ADMIN'), syntheseBudget);
router.get('/', requireAuth, listerDepenses);
router.post('/', requireAuth, creerDepense);

module.exports = router;