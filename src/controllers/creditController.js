const prisma = require('../lib/prisma');

// GET /api/credits?statut=EN_COURS|SOLDE&lieuId=&clientId=
// Liste les ventes à crédit avec le montant déjà payé et le montant restant dû.
async function listerVentesCredit(req, res) {
  const { lieuId, clientId, statut } = req.query;
  const where = { typeVente: 'CREDIT', statut: 'VALIDEE' };
  if (lieuId) where.lieuId = Number(lieuId);
  if (clientId) where.clientId = Number(clientId);

  const ventes = await prisma.vente.findMany({
    where,
    include: {
      client: true,
      vendeur: true,
      lieu: true,
      paiements: true,
      reglements: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const resultats = ventes.map((v) => {
    const dejaPayeInitial = v.paiements.reduce((s, p) => s + Number(p.montant), 0);
    const dejaPayeApres = v.reglements.reduce((s, r) => s + Number(r.montant), 0);
    const totalPaye = dejaPayeInitial + dejaPayeApres;
    const montantRestant = Number(v.totalNet) - totalPaye;
    return { ...v, totalPaye, montantRestant };
  });

  const filtres =
    statut === 'EN_COURS' ? resultats.filter((v) => v.montantRestant > 0)
    : statut === 'SOLDE' ? resultats.filter((v) => v.montantRestant <= 0)
    : resultats;

  res.json(filtres);
}

// POST /api/credits/:venteId/reglements   body: { montant, mode }
async function ajouterReglement(req, res) {
  const venteId = Number(req.params.venteId);
  const { montant, mode } = req.body;
  const utilisateurId = req.user.id;

  if (!(Number(montant) > 0) || !mode) {
    return res.status(400).json({ error: 'Montant et mode de paiement requis.' });
  }

  try {
    const resultat = await prisma.$transaction(async (tx) => {
      const vente = await tx.vente.findUnique({
        where: { id: venteId },
        include: { paiements: true, reglements: true },
      });
      if (!vente) throw new Error('Vente introuvable.');
      if (vente.typeVente !== 'CREDIT') throw new Error("Cette vente n'est pas une vente à crédit.");
      if (vente.statut === 'ANNULEE') throw new Error('Cette vente est annulée.');

      const dejaPaye =
        vente.paiements.reduce((s, p) => s + Number(p.montant), 0) +
        vente.reglements.reduce((s, r) => s + Number(r.montant), 0);
      const restant = Number(vente.totalNet) - dejaPaye;

      if (Number(montant) > restant + 1) {
        throw new Error(`Le montant dépasse le solde restant dû (${restant.toFixed(2)}).`);
      }

      return tx.reglementCredit.create({
        data: { venteId, montant: Number(montant), mode, utilisateurId },
      });
    }, { maxWait: 10000, timeout: 20000 });

    res.status(201).json(resultat);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = { listerVentesCredit, ajouterReglement };