const prisma = require('../lib/prisma');

// GET /api/ventes-en-attente?lieuId=
// Visible par tous (n'importe quel poste/caissier de la boutique doit pouvoir la
// retrouver, pas seulement celle qui l'a mise en attente).
async function listerVentesEnAttente(req, res) {
  const { lieuId } = req.query;
  const where = lieuId ? { lieuId: Number(lieuId) } : {};
  const ventes = await prisma.venteEnAttente.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  const utilisateurIds = [...new Set(ventes.map((v) => v.utilisateurId))];
  const utilisateurs = await prisma.utilisateur.findMany({ where: { id: { in: utilisateurIds } } });
  const nomParUtilisateur = Object.fromEntries(utilisateurs.map((u) => [u.id, u.nomComplet]));

  res.json(ventes.map((v) => ({
    id: v.id,
    lieuId: v.lieuId,
    createdAt: v.createdAt,
    creePar: nomParUtilisateur[v.utilisateurId] || 'Inconnu',
    ...v.donnees,
  })));
}

// POST /api/ventes-en-attente   { lieuId, donnees }
async function creerVenteEnAttente(req, res) {
  const { lieuId, donnees } = req.body;
  if (!lieuId || !donnees) {
    return res.status(400).json({ error: 'lieuId et donnees sont requis.' });
  }
  const vente = await prisma.venteEnAttente.create({
    data: { lieuId: Number(lieuId), utilisateurId: req.user.id, donnees },
  });
  res.status(201).json(vente);
}

// DELETE /api/ventes-en-attente/:id
async function supprimerVenteEnAttente(req, res) {
  const id = Number(req.params.id);
  try {
    await prisma.venteEnAttente.delete({ where: { id } });
    res.status(204).end();
  } catch {
    res.status(404).json({ error: 'Vente en attente introuvable (peut-être déjà reprise ailleurs).' });
  }
}

module.exports = { listerVentesEnAttente, creerVenteEnAttente, supprimerVenteEnAttente };
