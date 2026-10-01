const prisma = require('../lib/prisma');
const { appliquerMouvementStock } = require('../lib/stock');
const { enregistrerActivite } = require('../lib/journal');

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
// - Administrateur : applique directement la correction pour chaque ligne en écart, tracée
//   dans l'historique des mouvements (CORRECTION_INVENTAIRE).
// - Autre compte (ex. gestionnaire de stock) : NE TOUCHE PAS au stock. Le comptage est
//   enregistré « en attente » et un administrateur doit le valider (ou le rejeter).
// Les lignes sans écart sont ignorées dans les deux cas.
async function appliquerInventaire(req, res) {
  const { lieuId, lignes, notes } = req.body;
  const utilisateurId = req.user.id;

  if (!lieuId || !Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Lieu et au moins une ligne sont requis.' });
  }

  if (req.user.role !== 'ADMIN') {
    return soumettreInventaire(req, res);
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

// Comptage d'un non-admin : on fige le stock système du moment et l'écart constaté,
// sans aucun mouvement de stock.
async function soumettreInventaire(req, res) {
  const { lieuId, lignes, notes } = req.body;
  const lieu = Number(lieuId);

  const lignesValides = [];
  const erreurs = [];
  for (const ligne of lignes) {
    const articleId = Number(ligne.articleId);
    const quantiteComptee = Number(ligne.quantiteComptee);
    if (!Number.isInteger(quantiteComptee) || quantiteComptee < 0) {
      erreurs.push({ articleId, error: 'Quantité comptée invalide.' });
      continue;
    }
    lignesValides.push({ articleId, quantiteComptee });
  }

  const stocks = await prisma.stockEmplacement.findMany({
    where: { lieuId: lieu, articleId: { in: lignesValides.map((l) => l.articleId) } },
  });
  const stockParArticle = Object.fromEntries(stocks.map((st) => [st.articleId, st.quantite]));

  const lignesEnEcart = lignesValides
    .map((l) => {
      const stockSysteme = stockParArticle[l.articleId] ?? 0;
      return { ...l, stockSysteme, ecart: l.quantiteComptee - stockSysteme };
    })
    .filter((l) => l.ecart !== 0);
  const inchanges = lignesValides.length - lignesEnEcart.length;

  if (lignesEnEcart.length === 0) {
    return res.json({ enAttente: false, corrections: 0, inchanges, erreurs });
  }

  const inventaire = await prisma.inventaireEnAttente.create({
    data: {
      lieuId: lieu,
      utilisateurId: req.user.id,
      notes: notes || null,
      lignes: { create: lignesEnEcart },
    },
  });

  res.status(201).json({
    enAttente: true, inventaireId: inventaire.id,
    lignesEnAttente: lignesEnEcart.length, inchanges, erreurs,
  });
}

// GET /api/stock/inventaires-en-attente?statut=EN_ATTENTE|VALIDE|REJETE
// Admin : toutes les soumissions. Autre compte : uniquement les siennes (pour suivre
// si ses corrections ont été validées ou rejetées).
async function listerInventairesEnAttente(req, res) {
  const { statut } = req.query;
  const where = {};
  if (statut) where.statut = statut;
  if (req.user.role !== 'ADMIN') where.utilisateurId = req.user.id;

  const inventaires = await prisma.inventaireEnAttente.findMany({
    where,
    include: {
      lieu: { select: { nom: true } },
      utilisateur: { select: { nomComplet: true } },
      traitePar: { select: { nomComplet: true } },
      lignes: { include: { article: { select: { reference: true, designation: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(inventaires);
}

// POST /api/stock/inventaires-en-attente/:id/valider   (ADMIN)
// Applique l'écart constaté au comptage pour chaque ligne, en une seule transaction :
// soit tout passe, soit rien (message d'erreur clair si un stock deviendrait négatif).
// Le mouvement est attribué à l'auteur du comptage (il reste dans SON rapport d'activité),
// la note précise qui a validé.
async function validerInventaire(req, res) {
  const id = Number(req.params.id);
  const inventaire = await prisma.inventaireEnAttente.findUnique({
    where: { id },
    include: { lignes: { include: { article: true } }, utilisateur: true, lieu: true },
  });
  if (!inventaire) return res.status(404).json({ error: 'Inventaire introuvable.' });
  if (inventaire.statut !== 'EN_ATTENTE') {
    return res.status(409).json({ error: 'Cet inventaire a déjà été traité.' });
  }

  const validateur = await prisma.utilisateur.findUnique({ where: { id: req.user.id } });
  const note = `Inventaire de ${inventaire.utilisateur.nomComplet} validé par ${validateur?.nomComplet || 'un administrateur'}`
    + (inventaire.notes ? ` — ${inventaire.notes}` : '');

  try {
    await prisma.$transaction(async (tx) => {
      for (const ligne of inventaire.lignes) {
        try {
          await appliquerMouvementStock(tx, {
            articleId: ligne.articleId, lieuId: inventaire.lieuId, delta: ligne.ecart,
            type: 'CORRECTION_INVENTAIRE', utilisateurId: inventaire.utilisateurId, notes: note,
          });
        } catch (err) {
          throw new Error(`${ligne.article.designation} : ${err.message.startsWith('Stock insuffisant')
            ? "le stock actuel est déjà plus bas que l'écart à retirer (des ventes ont eu lieu depuis le comptage). Rejetez et refaites le comptage."
            : err.message}`);
        }
      }
      await tx.inventaireEnAttente.update({
        where: { id },
        data: { statut: 'VALIDE', traiteParId: req.user.id, traiteLe: new Date() },
      });
      await enregistrerActivite(tx, {
        type: 'INVENTAIRE_VALIDE',
        description: `Inventaire n°${id} (${inventaire.lieu.nom}, ${inventaire.lignes.length} ligne(s)) de ${inventaire.utilisateur.nomComplet} validé`,
        utilisateurId: req.user.id,
      });
    }, { timeout: 30000 });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  res.json({ ok: true, corrections: inventaire.lignes.length });
}

// POST /api/stock/inventaires-en-attente/:id/rejeter   { motif? }   (ADMIN)
async function rejeterInventaire(req, res) {
  const id = Number(req.params.id);
  const { motif } = req.body || {};
  const inventaire = await prisma.inventaireEnAttente.findUnique({
    where: { id }, include: { utilisateur: true, lieu: true, lignes: true },
  });
  if (!inventaire) return res.status(404).json({ error: 'Inventaire introuvable.' });
  if (inventaire.statut !== 'EN_ATTENTE') {
    return res.status(409).json({ error: 'Cet inventaire a déjà été traité.' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.inventaireEnAttente.update({
      where: { id },
      data: { statut: 'REJETE', traiteParId: req.user.id, traiteLe: new Date(), motifRejet: motif?.trim() || null },
    });
    await enregistrerActivite(tx, {
      type: 'INVENTAIRE_REJETE',
      description: `Inventaire n°${id} (${inventaire.lieu.nom}, ${inventaire.lignes.length} ligne(s)) de ${inventaire.utilisateur.nomComplet} rejeté`
        + (motif?.trim() ? ` — motif : ${motif.trim()}` : ''),
      utilisateurId: req.user.id,
    });
  });

  res.json({ ok: true });
}

module.exports = {
  previsualiserInventaire, appliquerInventaire,
  listerInventairesEnAttente, validerInventaire, rejeterInventaire,
};
