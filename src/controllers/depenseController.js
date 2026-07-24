const prisma = require('../lib/prisma');

function debutJournee(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function finJournee(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// GET /api/depenses?categorieId=&dateDebut=&dateFin=&utilisateurId=
async function listerDepenses(req, res) {
  const { categorieId, dateDebut, dateFin, utilisateurId } = req.query;

  let where = {};

  if (req.user.role !== 'ADMIN') {
    where = {
      utilisateurId: req.user.id,
      dateDepense: { gte: debutJournee(), lte: finJournee() },
    };
  } else {
    if (categorieId) where.categorieId = Number(categorieId);
    if (utilisateurId) where.utilisateurId = Number(utilisateurId);
    if (dateDebut || dateFin) {
      where.dateDepense = {};
      if (dateDebut) where.dateDepense.gte = debutJournee(new Date(dateDebut));
      if (dateFin) where.dateDepense.lte = finJournee(new Date(dateFin));
    }
  }

  const depenses = await prisma.depense.findMany({
    where,
    include: { categorie: true, utilisateur: { select: { id: true, nomComplet: true } }, lieu: true },
    orderBy: { dateDepense: 'desc' },
  });
  res.json(depenses);
}

// POST /api/depenses   { categorieId, montant, description?, dateDepense? }
async function creerDepense(req, res) {
  const { categorieId, montant, description, dateDepense, lieuId } = req.body;
  if (!categorieId || !montant) {
    return res.status(400).json({ error: 'Catégorie et montant sont requis.' });
  }

  const depense = await prisma.depense.create({
    data: {
      categorieId: Number(categorieId),
      montant,
      description: description || null,
      utilisateurId: req.user.id,
      dateDepense: dateDepense ? new Date(dateDepense) : new Date(),
      lieuId: lieuId ? Number(lieuId) : null,
    },
    include: { categorie: true, lieu: true },
  });
  res.status(201).json(depense);
}

// GET /api/depenses/categories
async function listerCategories(req, res) {
  const categories = await prisma.categorieDepense.findMany({ orderBy: { nom: 'asc' } });
  res.json(categories);
}

// POST /api/depenses/categories   { nom }   (ADMIN uniquement)
async function creerCategorie(req, res) {
  const { nom } = req.body;
  if (!nom || !nom.trim()) return res.status(400).json({ error: 'Le nom de la catégorie est requis.' });
  try {
    const categorie = await prisma.categorieDepense.create({ data: { nom: nom.trim() } });
    res.status(201).json(categorie);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Cette catégorie existe déjà.' });
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

// PUT /api/depenses/categories/:id   { nom }   (ADMIN uniquement)
async function modifierCategorie(req, res) {
  const id = Number(req.params.id);
  const { nom } = req.body;
  if (!nom || !nom.trim()) return res.status(400).json({ error: 'Le nom de la catégorie est requis.' });

  const categorie = await prisma.categorieDepense.findUnique({ where: { id } });
  if (!categorie) return res.status(404).json({ error: 'Catégorie introuvable.' });

  try {
    const misAJour = await prisma.categorieDepense.update({ where: { id }, data: { nom: nom.trim() } });
    res.json(misAJour);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Cette catégorie existe déjà.' });
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

// DELETE /api/depenses/categories/:id   (ADMIN uniquement)
// Refuse la suppression si des dépenses existantes utilisent encore cette catégorie.
async function supprimerCategorie(req, res) {
  const id = Number(req.params.id);
  const categorie = await prisma.categorieDepense.findUnique({
    where: { id },
    include: { _count: { select: { depenses: true } } },
  });
  if (!categorie) return res.status(404).json({ error: 'Catégorie introuvable.' });
  if (categorie._count.depenses > 0) {
    return res.status(400).json({ error: `Cette catégorie est utilisée par ${categorie._count.depenses} dépense(s), suppression impossible.` });
  }
  await prisma.categorieDepense.delete({ where: { id } });
  res.json({ ok: true });
}

// GET /api/depenses/budget?dateDebut=&dateFin=   (ADMIN uniquement)
async function syntheseBudget(req, res) {
  const { dateDebut, dateFin } = req.query;

  const where = {};
  if (dateDebut || dateFin) {
    where.dateDepense = {};
    if (dateDebut) where.dateDepense.gte = debutJournee(new Date(dateDebut));
    if (dateFin) where.dateDepense.lte = finJournee(new Date(dateFin));
  }

  const depenses = await prisma.depense.findMany({ where, include: { categorie: true } });

  const parCategorie = {};
  let totalGeneral = 0;

  for (const d of depenses) {
    const nomCategorie = d.categorie.nom;
    const montant = Number(d.montant);
    parCategorie[nomCategorie] = (parCategorie[nomCategorie] || 0) + montant;
    totalGeneral += montant;
  }

  res.json({
    periode: { dateDebut: dateDebut || null, dateFin: dateFin || null },
    parCategorie,
    totalGeneral,
  });
}

module.exports = {
  listerDepenses, creerDepense, listerCategories, creerCategorie, modifierCategorie, supprimerCategorie, syntheseBudget,
};