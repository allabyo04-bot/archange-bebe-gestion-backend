const prisma = require('../lib/prisma');
const { appliquerMouvementStock } = require('../lib/stock');

function genererReferenceAvoir() {
  const maintenant = new Date();
  return `AV-${maintenant.getTime()}`;
}

// GET /api/retours/ventes?q=...
async function rechercherVenteOrigine(req, res) {
  const { q } = req.query;
  const terme = (q || '').trim();

  if (!terme) {
    return res.status(400).json({ error: 'Tapez un numéro de vente, un nom ou un téléphone.' });
  }

  const ventes = await prisma.vente.findMany({
    where: {
      statut: 'VALIDEE',
      OR: [
        { numero: { contains: terme, mode: 'insensitive' } },
        { client: { nomComplet: { contains: terme, mode: 'insensitive' } } },
        { client: { telephone: { contains: terme } } },
      ],
    },
    include: { lignes: { include: { article: true } }, client: true, lieu: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  res.json(ventes);
}

// POST /api/retours   body: { venteOrigineId, lieuId, lignes: [{articleId, quantite, prixUnitaire}] }
async function creerRetour(req, res) {
  const { venteOrigineId, lieuId, lignes } = req.body;
  const utilisateurId = req.user.id;

  if (!venteOrigineId || !lieuId || !Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: "Vente d'origine, lieu et au moins un article sont requis." });
  }

  try {
    const resultat = await prisma.$transaction(async (tx) => {
      const venteOrigine = await tx.vente.findUnique({ where: { id: Number(venteOrigineId) } });
      if (!venteOrigine) throw new Error("Vente d'origine introuvable.");

      const montant = lignes.reduce((s, l) => s + Number(l.prixUnitaire) * Number(l.quantite), 0);

      const avoir = await tx.avoir.create({
        data: {
          reference: genererReferenceAvoir(),
          venteOrigineId: Number(venteOrigineId),
          montant,
          utilisateurId,
          lignes: {
            create: lignes.map((l) => ({
              articleId: Number(l.articleId),
              quantite: Number(l.quantite),
              prixUnitaire: l.prixUnitaire,
            })),
          },
        },
        include: { lignes: true },
      });

      for (const ligne of avoir.lignes) {
        await appliquerMouvementStock(tx, {
          articleId: ligne.articleId,
          lieuId: Number(lieuId),
          delta: ligne.quantite,
          type: 'RETOUR_CLIENT',
          utilisateurId,
          notes: `Retour - avoir ${avoir.reference}`,
        });
      }

      return avoir;
    }, { maxWait: 10000, timeout: 20000 });

    res.status(201).json(resultat);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// GET /api/avoirs?statut=ACTIF|UTILISE
async function listerAvoirs(req, res) {
  const { statut } = req.query;
  const where = {};
  if (statut) where.statut = statut;

  const avoirs = await prisma.avoir.findMany({
    where,
    include: {
      lignes: { include: { article: true } },
      venteOrigine: { include: { client: true } },
      utilisateur: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(avoirs);
}

// GET /api/avoirs/:reference
// Consultation rapide d'un avoir par son code, pour vérifier sa validité avant de
// l'utiliser sur une vente (sans encore le consommer).
async function obtenirAvoirParReference(req, res) {
  const { reference } = req.params;
  const avoir = await prisma.avoir.findUnique({
    where: { reference },
    include: { venteOrigine: { include: { client: true } } },
  });
  if (!avoir) return res.status(404).json({ error: 'Avoir introuvable.' });
  res.json(avoir);
}

module.exports = { rechercherVenteOrigine, creerRetour, listerAvoirs, obtenirAvoirParReference };