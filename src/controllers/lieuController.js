const prisma = require('../lib/prisma');

// GET /api/stock/lieux
async function listerLieux(req, res) {
  const lieux = await prisma.lieu.findMany({ where: { actif: true }, orderBy: { nom: 'asc' } });
  res.json(lieux);
}

// POST /api/stock/lieux  { nom, type }  -- type: ENTREPOT | BOUTIQUE
async function creerLieu(req, res) {
  const { nom, type } = req.body;
  if (!nom || !type) return res.status(400).json({ error: 'Nom et type du lieu requis.' });
  try {
    const lieu = await prisma.lieu.create({ data: { nom, type } });
    res.status(201).json(lieu);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ce nom de lieu existe déjà.' });
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

// PUT /api/stock/lieux/:id  { nom?, type?, actif? }
async function modifierLieu(req, res) {
  const id = Number(req.params.id);
  const { nom, type, actif } = req.body;

  const lieu = await prisma.lieu.findUnique({ where: { id } });
  if (!lieu) return res.status(404).json({ error: 'Lieu introuvable.' });

  try {
    const misAJour = await prisma.lieu.update({
      where: { id },
      data: {
        nom: nom ?? lieu.nom,
        type: type ?? lieu.type,
        actif: actif !== undefined ? actif : lieu.actif,
      },
    });
    res.json(misAJour);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Ce nom de lieu existe déjà.' });
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

// GET /api/stock/lieux/:id/stock
async function stockParLieu(req, res) {
  const lieuId = Number(req.params.id);
  const stocks = await prisma.stockEmplacement.findMany({
    where: { lieuId },
    include: { article: true },
    orderBy: { article: { designation: 'asc' } },
  });
  res.json(stocks);
}

module.exports = { listerLieux, creerLieu, modifierLieu, stockParLieu };