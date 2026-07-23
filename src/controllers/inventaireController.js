const prisma = require('../lib/prisma');
const { appliquerMouvementStock } = require('../lib/stock');

async function avecReessai(fn, tentatives = 3) {
  for (let i = 1; i <= tentatives; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === tentatives) throw err;
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

// GET /api/stock/inventaire?lieuId=&portee=article|famille|sous-famille&cibleId=
// Renvoie la liste des articles concernés (un seul article, ou tous ceux d'une famille /
// sous-famille), avec leur stock actuel dans le lieu choisi — prête à être comptée.
async function previsualiserInventaire(req, res) {
  const { lieuId, portee, cibleId } = req.query;
  if (!lieuId || !portee || !cibleId) {
    return res.status(400).json({ error: 'lieuId, portee et cibleId sont requis.' });
  }

  const where = { actif: true };
  if (portee === 'article') where.id = Number(cibleId);
  else if (portee === 'famille') where.familleId = Number(cibleId);
  else if (portee === 'sous-famille') where.sousFamilleId = Number(cibleId);
  else return res.status(400).json({ error: 'portee doit être "article", "famille" ou "sous-famille".' });

  const articles = await prisma.article.findMany({
    where,
    orderBy: { designation: 'asc' },
  });
  if (articles.length === 0) {
    return res.json({ articles: [] });
  }

  const stocks = await prisma.stockEmplacement.findMany({
    where: { lieuId: Number(lieuId), articleId: { in: articles.map((a) => a.id) } },
  });
  const stockParArticle = Object.fromEntries(stocks.map((s) => [s.articleId, s.quantite]));

  res.json({
    articles: articles.map((a) => ({
      articleId: a.id,
      reference: a.reference,
      designation: a.designation,
      stockActuel: stockParArticle[a.id] ?? 0,
    })),
  });
}

// POST /api/stock/inventaire   { lieuId, lignes: [{ articleId, quantiteComptee }] }
// Applique la correction pour chaque ligne dont la quantité comptée diffère du stock
// système — trace chaque écart dans l'historique des mouvements (CORRECTION_INVENTAIRE).
// Les lignes sans écart sont ignorées (pas de mouvement inutile dans l'historique).
async function appliquerInventaire(req, res) {
  const { lieuId, lignes, notes } = req.body;
  const utilisateurId = req.user.id;

  if (!lieuId || !Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Lieu et au moins une ligne sont requis.' });
  }

  let corrections = 0;
  let inchanges = 0;
  const erreurs = [];

  for (const ligne of lignes) {
    const articleId = Number(ligne.articleId);
    const quantiteComptee = Number(ligne.quantiteComptee);
    if (Number.isNaN(quantiteComptee) || quantiteComptee < 0) {
      erreurs.push({ articleId, error: 'Quantité comptée invalide.' });
      continue;
    }

    try {
      const stockEmplacement = await avecReessai(() => prisma.stockEmplacement.findUnique({
        where: { articleId_lieuId: { articleId, lieuId: Number(lieuId) } },
      }));
      const stockActuel = stockEmplacement ? stockEmplacement.quantite : 0;
      const delta = quantiteComptee - stockActuel;

      if (delta === 0) { inchanges++; continue; }

      await avecReessai(() => prisma.$transaction(async (tx) => {
        await appliquerMouvementStock(tx, {
          articleId, lieuId: Number(lieuId), delta,
          type: 'CORRECTION_INVENTAIRE', utilisateurId,
          notes: notes || 'Inventaire',
        });
      }));
      corrections++;
    } catch (err) {
      erreurs.push({ articleId, error: err.message });
    }
  }

  res.json({ corrections, inchanges, erreurs });
}

module.exports = { previsualiserInventaire, appliquerInventaire };
