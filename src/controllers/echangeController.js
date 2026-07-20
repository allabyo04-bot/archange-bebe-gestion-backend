const prisma = require('../lib/prisma');
const { appliquerMouvementStock } = require('../lib/stock');

function genererReferenceEchange() {
  const maintenant = new Date();
  return `ECH-${maintenant.getTime()}`;
}

// POST /api/echanges
// body: { venteOrigineId?, lieuId, articlesRepris: [{articleId, quantite, prixUnitaire}],
//         articlesNouveaux: [{articleId, quantite, prixUnitaire}], paiements?: [{mode, montant}] }
async function creerEchange(req, res) {
  const { venteOrigineId, lieuId, articlesRepris, articlesNouveaux, paiements } = req.body;
  const utilisateurId = req.user.id;

  if (!lieuId || !Array.isArray(articlesRepris) || articlesRepris.length === 0) {
    return res.status(400).json({ error: 'Lieu et au moins un article repris sont requis.' });
  }
  if (!Array.isArray(articlesNouveaux) || articlesNouveaux.length === 0) {
    return res.status(400).json({ error: 'Au moins un nouvel article est requis.' });
  }

  try {
    const resultat = await prisma.$transaction(async (tx) => {
      const valeurReprise = articlesRepris.reduce(
        (s, a) => s + Number(a.prixUnitaire) * Number(a.quantite), 0
      );
      const valeurNouveaux = articlesNouveaux.reduce(
        (s, a) => s + Number(a.prixUnitaire) * Number(a.quantite), 0
      );
      const montantAPayer = Math.max(0, valeurNouveaux - valeurReprise);

      if (montantAPayer > 0) {
        const totalPaiements = (paiements || []).reduce((s, p) => s + Number(p.montant), 0);
        if (Math.abs(totalPaiements - montantAPayer) > 1) {
          throw new Error(
            `Le total des paiements (${totalPaiements}) ne correspond pas au montant à payer (${montantAPayer}).`
          );
        }
      }

      const echange = await tx.echange.create({
        data: {
          reference: genererReferenceEchange(),
          venteOrigineId: venteOrigineId ? Number(venteOrigineId) : null,
          lieuId: Number(lieuId),
          valeurReprise,
          valeurNouveaux,
          montantAPayer,
          utilisateurId,
          articlesRepris: {
            create: articlesRepris.map((a) => ({
              articleId: Number(a.articleId),
              quantite: Number(a.quantite),
              prixUnitaire: a.prixUnitaire,
            })),
          },
          articlesNouveaux: {
            create: articlesNouveaux.map((a) => ({
              articleId: Number(a.articleId),
              quantite: Number(a.quantite),
              prixUnitaire: a.prixUnitaire,
            })),
          },
          paiements: montantAPayer > 0 ? {
            create: (paiements || []).map((p) => ({ mode: p.mode, montant: Number(p.montant) })),
          } : undefined,
        },
        include: { articlesRepris: true, articlesNouveaux: true, paiements: true },
      });

      for (const ligne of echange.articlesRepris) {
        await appliquerMouvementStock(tx, {
          articleId: ligne.articleId,
          lieuId: Number(lieuId),
          delta: ligne.quantite,
          type: 'RETOUR_CLIENT',
          utilisateurId,
          notes: `Échange ${echange.reference} - article repris`,
        });
      }

      for (const ligne of echange.articlesNouveaux) {
        await appliquerMouvementStock(tx, {
          articleId: ligne.articleId,
          lieuId: Number(lieuId),
          delta: -ligne.quantite,
          type: 'SORTIE_VENTE',
          utilisateurId,
          notes: `Échange ${echange.reference} - nouvel article`,
        });
      }

      return echange;
    }, { maxWait: 10000, timeout: 20000 });

    res.status(201).json(resultat);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// GET /api/echanges?lieuId=
async function listerEchanges(req, res) {
  const { lieuId } = req.query;
  const where = {};
  if (lieuId) where.lieuId = Number(lieuId);

  const echanges = await prisma.echange.findMany({
    where,
    include: {
      articlesRepris: { include: { article: true } },
      articlesNouveaux: { include: { article: true } },
      paiements: true,
      lieu: true,
      utilisateur: true,
      venteOrigine: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(echanges);
}

module.exports = { creerEchange, listerEchanges };