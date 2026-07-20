const prisma = require('../lib/prisma');

// GET /api/vendeurs?lieuId=   (actifs uniquement — utilisé par la Caisse)
// Si lieuId est fourni : renvoie les vendeurs de cette boutique + les vendeurs
// non assignés à une boutique en particulier (lieuId null), pour rester souple.
// Sans lieuId : renvoie tous les vendeurs actifs (comportement historique).
async function listerVendeurs(req, res) {
  const { lieuId } = req.query;
  const where = { actif: true };
  if (lieuId) {
    where.OR = [{ lieuId: Number(lieuId) }, { lieuId: null }];
  }
  const vendeurs = await prisma.vendeur.findMany({
    where,
    orderBy: { nomComplet: 'asc' },
  });
  res.json(vendeurs);
}

// GET /api/vendeurs/tous   (ADMIN — actifs + désactivés, pour l'écran de gestion)
async function listerTousVendeurs(req, res) {
  const vendeurs = await prisma.vendeur.findMany({
    include: { lieu: true },
    orderBy: { nomComplet: 'asc' },
  });
  res.json(vendeurs);
}

// POST /api/vendeurs   { nomComplet, telephone?, lieuId? }
async function creerVendeur(req, res) {
  const { nomComplet, telephone, lieuId } = req.body;
  if (!nomComplet) return res.status(400).json({ error: 'Nom complet requis.' });
  const vendeur = await prisma.vendeur.create({
    data: {
      nomComplet,
      telephone: telephone || null,
      lieuId: lieuId ? Number(lieuId) : null,
    },
    include: { lieu: true },
  });
  res.status(201).json(vendeur);
}

// PUT /api/vendeurs/:id   { nomComplet?, telephone?, lieuId?, actif? }
async function modifierVendeur(req, res) {
  const id = Number(req.params.id);
  const { nomComplet, telephone, lieuId, actif } = req.body;

  const donnees = {};
  if (nomComplet !== undefined) donnees.nomComplet = nomComplet;
  if (telephone !== undefined) donnees.telephone = telephone || null;
  if (lieuId !== undefined) donnees.lieuId = lieuId ? Number(lieuId) : null;
  if (actif !== undefined) donnees.actif = actif;

  const vendeur = await prisma.vendeur.update({
    where: { id },
    data: donnees,
    include: { lieu: true },
  });
  res.json(vendeur);
}

module.exports = { listerVendeurs, listerTousVendeurs, creerVendeur, modifierVendeur };
