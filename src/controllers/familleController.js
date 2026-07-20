const prisma = require('../lib/prisma');

// GET /api/familles  -> familles avec leurs sous-familles
async function listerFamilles(req, res) {
  const familles = await prisma.famille.findMany({
    where: { actif: true },
    include: { sousFamilles: { where: { actif: true } } },
    orderBy: { nom: 'asc' },
  });
  res.json(familles);
}

// POST /api/familles  { nom }
async function creerFamille(req, res) {
  const { nom } = req.body;
  if (!nom) return res.status(400).json({ error: 'Le nom de la famille est requis.' });
  try {
    const famille = await prisma.famille.create({ data: { nom } });
    res.status(201).json(famille);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Cette famille existe déjà.' });
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

// POST /api/familles/:familleId/sous-familles  { nom, codePrefixe }
// codePrefixe : choisi par Victoria (ex: "ANDT"), sert de base à la génération
// automatique de la référence de chaque article (ANDT01, ANDT02...).
async function creerSousFamille(req, res) {
  const familleId = Number(req.params.familleId);
  const { nom, codePrefixe } = req.body;
  if (!nom) return res.status(400).json({ error: 'Le nom de la sous-famille est requis.' });
  if (!codePrefixe || !codePrefixe.trim()) {
    return res.status(400).json({ error: 'Le code (préfixe) de la sous-famille est requis.' });
  }
  try {
    const sousFamille = await prisma.sousFamille.create({
      data: { nom, familleId, codePrefixe: codePrefixe.trim().toUpperCase() },
    });
    res.status(201).json(sousFamille);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ce nom de sous-famille ou ce code existe déjà.' });
    }
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

module.exports = { listerFamilles, creerFamille, creerSousFamille };