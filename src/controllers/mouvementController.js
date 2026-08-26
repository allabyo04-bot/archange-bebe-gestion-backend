const prisma = require('../lib/prisma');

// GET /api/stock/mouvements?articleId=&lieuId=&type=&dateDebut=&dateFin=
// Historique complet des mouvements de stock (entrées, ventes, annulations, transferts,
// corrections...), avec possibilité de filtrer par article pour tracer tout ce qui s'est
// passé sur un produit précis, tous emplacements et tous types de mouvement confondus.
async function listerMouvements(req, res) {
  const { articleId, lieuId, type, dateDebut, dateFin } = req.query;

  const where = {};
  if (articleId) where.articleId = Number(articleId);
  if (lieuId) where.lieuId = Number(lieuId);
  if (type) where.type = type;
  if (dateDebut || dateFin) {
    where.createdAt = {};
    if (dateDebut) {
      const d = new Date(dateDebut);
      d.setHours(0, 0, 0, 0);
      where.createdAt.gte = d;
    }
    if (dateFin) {
      const d = new Date(dateFin);
      d.setHours(23, 59, 59, 999);
      where.createdAt.lte = d;
    }
  }

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
