const prisma = require('../lib/prisma');
const { appliquerMouvementStock } = require('../lib/stock');

// GET /api/fidelite?statut=
// Le modèle RecompenseFidelite n'a pas de relation Prisma directe vers Article
// (juste un articleOffertId) : on va chercher les articles concernés à part et
// on les recolle, pour ne pas avoir à toucher au schema.
async function listerRecompenses(req, res) {
  const { statut } = req.query;
  const where = {};
  if (statut) where.statut = statut;

  const recompenses = await prisma.recompenseFidelite.findMany({
    where,
    include: { client: true },
    orderBy: { dateAtteinte: 'desc' },
  });

  const idsArticles = recompenses.filter((r) => r.articleOffertId).map((r) => r.articleOffertId);
  const articles = idsArticles.length
    ? await prisma.article.findMany({ where: { id: { in: idsArticles } } })
    : [];
  const carteArticles = Object.fromEntries(articles.map((a) => [a.id, a]));

  const resultats = recompenses.map((r) => ({
    ...r,
    articleOffert: r.articleOffertId ? carteArticles[r.articleOffertId] || null : null,
  }));

  res.json(resultats);
}

// PUT /api/fidelite/:id   { type, valeurRemise?, articleOffertId?, description? }
// Définit ce que sera le cadeau. Passe la récompense au statut DEFINIE.
async function definirRecompense(req, res) {
  const id = Number(req.params.id);
  const { type, valeurRemise, articleOffertId, description } = req.body;

  const recompense = await prisma.recompenseFidelite.findUnique({ where: { id } });
  if (!recompense) return res.status(404).json({ error: 'Récompense introuvable.' });
  if (recompense.statut === 'UTILISEE') {
    return res.status(400).json({ error: 'Ce cadeau a déjà été remis au client, il ne peut plus être modifié.' });
  }
  if (!type || !['REMISE', 'ARTICLE', 'AUTRE'].includes(type)) {
    return res.status(400).json({ error: 'Choisissez le type de cadeau (remise, article offert ou autre).' });
  }
  if (type === 'ARTICLE' && !articleOffertId) {
    return res.status(400).json({ error: "Choisissez l'article offert." });
  }
  if (type === 'REMISE' && !(Number(valeurRemise) > 0)) {
    return res.status(400).json({ error: 'Indiquez le montant de la remise.' });
  }

  const misAJour = await prisma.recompenseFidelite.update({
    where: { id },
    data: {
      type,
      statut: 'DEFINIE',
      valeurRemise: type === 'REMISE' ? Number(valeurRemise) : null,
      articleOffertId: type === 'ARTICLE' ? Number(articleOffertId) : null,
      description: description || null,
    },
  });

  res.json(misAJour);
}

// POST /api/fidelite/:id/marquer-utilisee   { lieuId? }
// lieuId est obligatoire quand le cadeau est un article offert, pour savoir
// de quelle boutique/entrepôt le sortir du stock.
async function marquerUtilisee(req, res) {
  const id = Number(req.params.id);
  const { lieuId } = req.body;
  const utilisateurId = req.user.id;

  const recompense = await prisma.recompenseFidelite.findUnique({ where: { id }, include: { client: true } });
  if (!recompense) return res.status(404).json({ error: 'Récompense introuvable.' });
  if (recompense.statut !== 'DEFINIE') {
    return res.status(400).json({ error: 'Définissez le cadeau avant de le marquer comme remis.' });
  }
  if (recompense.type === 'ARTICLE' && !lieuId) {
    return res.status(400).json({ error: "Choisissez la boutique/entrepôt d'où sort l'article offert." });
  }

  try {
    const misAJour = await prisma.$transaction(async (tx) => {
      if (recompense.type === 'ARTICLE') {
        await appliquerMouvementStock(tx, {
          articleId: recompense.articleOffertId,
          lieuId: Number(lieuId),
          delta: -1,
          type: 'SORTIE_FIDELITE',
          utilisateurId,
          notes: `Cadeau fidélité pour ${recompense.client.nomComplet}`,
        });
      }
      return tx.recompenseFidelite.update({
        where: { id },
        data: { statut: 'UTILISEE', dateUtilisation: new Date() },
      });
    });
    res.json(misAJour);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = { listerRecompenses, definirRecompense, marquerUtilisee };
