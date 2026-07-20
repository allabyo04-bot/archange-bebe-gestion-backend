const prisma = require('../lib/prisma');
const { appliquerMouvementStock } = require('../lib/stock');

// POST /api/receptions
// body: { fournisseur?, reference?, lieuId, notes?, lignes: [{ articleId, quantite, prixAchat }] }
async function creerReception(req, res) {
  const { fournisseur, reference, lieuId, notes, lignes } = req.body;
  const utilisateurId = req.user.id;

  if (!lieuId || !Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Lieu et au moins une ligne sont requis.' });
  }

  try {
    const reception = await prisma.$transaction(async (tx) => {
      const rec = await tx.reception.create({
        data: {
          fournisseur: fournisseur || null, // volontairement optionnel
          reference: reference || null,
          lieuId: Number(lieuId),
          notes: notes || null,
          lignes: {
            create: lignes.map((l) => ({
              articleId: Number(l.articleId),
              quantite: Number(l.quantite),
              prixAchat: l.prixAchat,
            })),
          },
        },
        include: { lignes: true },
      });

      for (const ligne of rec.lignes) {
        // Le dernier prix d'achat connu sert de base au calcul de marge dans les États
        await tx.article.update({
          where: { id: ligne.articleId },
          data: { prixAchat: ligne.prixAchat },
        });

        await appliquerMouvementStock(tx, {
          articleId: ligne.articleId,
          lieuId: Number(lieuId),
          delta: ligne.quantite,
          type: 'ENTREE_RECEPTION',
          utilisateurId,
          notes: `Réception ${rec.reference || rec.id}${fournisseur ? ' - ' + fournisseur : ''}`,
        });
      }

      return rec;
    }, { maxWait: 10000, timeout: 20000 });

    res.status(201).json(reception);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// GET /api/receptions
async function listerReceptions(req, res) {
  const receptions = await prisma.reception.findMany({
    include: { lignes: { include: { article: true } }, lieu: true },
    orderBy: { dateReception: 'desc' },
  });
  res.json(receptions);
}

module.exports = { creerReception, listerReceptions };
