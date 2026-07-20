const prisma = require('../lib/prisma');
const { appliquerMouvementStock } = require('../lib/stock');

// POST /api/transferts
// body: { reference, lieuSourceId, lieuDestinationId, notes?, lignes: [{ articleId, quantite }] }
// Dès la création, le transfert est VALIDE : le stock sort immédiatement de la source
// et entre immédiatement dans la destination (pas d'étape de réception séparée).
async function creerTransfert(req, res) {
  const { reference, lieuSourceId, lieuDestinationId, notes, lignes } = req.body;
  const utilisateurId = req.user.id;

  if (!reference || !lieuSourceId || !lieuDestinationId || !Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Référence, lieux et au moins une ligne sont requis.' });
  }
  if (Number(lieuSourceId) === Number(lieuDestinationId)) {
    return res.status(400).json({ error: 'La source et la destination doivent être différentes.' });
  }

  try {
    const transfert = await prisma.$transaction(async (tx) => {
      const tr = await tx.transfertStock.create({
        data: {
          reference,
          lieuSourceId: Number(lieuSourceId),
          lieuDestinationId: Number(lieuDestinationId),
          notes: notes || null,
          lignes: {
            create: lignes.map((l) => ({
              articleId: Number(l.articleId),
              quantite: Number(l.quantite),
            })),
          },
        },
        include: { lignes: true },
      });

      for (const ligne of tr.lignes) {
        await appliquerMouvementStock(tx, {
          articleId: ligne.articleId,
          lieuId: Number(lieuSourceId),
          delta: -ligne.quantite,
          type: 'TRANSFERT_SORTIE',
          utilisateurId,
          notes: `Transfert ${tr.reference} vers lieu #${lieuDestinationId}`,
        });

        await appliquerMouvementStock(tx, {
          articleId: ligne.articleId,
          lieuId: Number(lieuDestinationId),
          delta: ligne.quantite,
          type: 'TRANSFERT_ENTREE',
          utilisateurId,
          notes: `Transfert ${tr.reference} depuis lieu #${lieuSourceId}`,
        });
      }

      return tr;
    }, { maxWait: 10000, timeout: 20000 });

    res.status(201).json(transfert);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// GET /api/transferts
async function listerTransferts(req, res) {
  const transferts = await prisma.transfertStock.findMany({
    include: { lignes: { include: { article: true } }, lieuSource: true, lieuDestination: true },
    orderBy: { dateTransfert: 'desc' },
  });
  res.json(transferts);
}

module.exports = { creerTransfert, listerTransferts };
