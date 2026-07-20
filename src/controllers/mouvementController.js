const prisma = require('../lib/prisma');

// GET /api/stock/mouvements?articleId=&lieuId=&type=
// Historique complet des mouvements de stock (entrées, ventes, annulations, transferts,
// corrections...), avec possibilité de filtrer par article pour tracer tout ce qui s'est
// passé sur un produit précis, tous emplacements et tous types de mouvement confondus.
async function listerMouvements(req, res) {
  const { articleId, lieuId, type } = req.query;

  const where = {};
  if (articleId) where.articleId = Number(articleId);
  if (lieuId) where.lieuId = Number(lieuId);
  if (type) where.type = type;

  const mouvements = await prisma.mouvementStock.findMany({
    where,
    include: {
      article: true,
      lieu: true,
      utilisateur: true,
      refVente: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  res.json(mouvements);
}

module.exports = { listerMouvements };
