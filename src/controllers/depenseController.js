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

// GET /api/depenses?categorieId=&sousCategorieId=&dateDebut=&dateFin=&utilisateurId=
async function listerDepenses(req, res) {
  const { categorieId, sousCategorieId, dateDebut, dateFin, utilisateurId } = req.query;

  let where = {};

  if (req.user.role !== 'ADMIN') {
    where = {
      utilisateurId: req.user.id,
      dateDepense: { gte: debutJournee(), lte: finJournee() },
    };
  } else {
    if (categorieId) where.categorieId = Number(categorieId);
    if (sousCategorieId) where.sousCategorieId = Number(sousCategorieId);
    if (utilisateurId) where.utilisateurId = Number(utilisateurId);
    if (dateDebut || dateFin) {
      where.dateDepense = {};
      if (dateDebut) where.dateDepense.gte = debutJournee(new Date(dateDebut));
      if (dateFin) where.dateDepense.lte = finJournee(new Date(dateFin));
    }
  }

  const depenses = await prisma.depense.findMany({
    where,
    include: { categorie: true, sousCategorie: true, utilisateur: { select: { id: true, nomComplet: true } }, lieu: true },
    orderBy: { dateDepense: 'desc' },
  });
  res.json(depenses);
}

// POST /api/depenses   { categorieId, sousCategorieId?, montant, description?, dateDepense? }
async function creerDepense(req, res) {
  const { categorieId, sousCategorieId, montant, description, dateDepense, lieuId } = req.body;
  if (!categorieId || !montant) {
    return res.status(400).json({ error: 'Catégorie et montant sont requis.' });
  }

  if (sousCategorieId) {
    const sousCategorie = await prisma.sousCategorieDepense.findUnique({ where: { id: Number(sousCategorieId) } });
    if (!sousCategorie || sousCategorie.categorieId !== Number(categorieId)) {
      return res.status(400).json({ error: "Cette sous-catégorie n'appartient pas à la catégorie choisie." });
    }
  }

  const depense = await prisma.depense.create({
    data: {
      categorieId: Number(categorieId),
      sousCategorieId: sousCategorieId ? Number(sousCategorieId) : null,
      montant,
      description: description || null,
      utilisateurId: req.user.id,
      dateDepense: dateDepense ? new Date(dateDepense) : new Date(),
      lieuId: lieuId ? Number(lieuId) : null,
    },
    include: { categorie: true, sousCategorie: true, lieu: true },
  });
  res.status(201).json(depense);
}

// GET /api/depenses/categories
async function listerCategories(req, res) {
  const categories = await prisma.categorieDepense.findMany({
    orderBy: { nom: 'asc' },
    include: { sousCategories: { orderBy: { nom: 'asc' } } },
  });
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

// POST /api/depenses/categories/:categorieId/sous-categories   { nom }   (ADMIN uniquement)
async function creerSousCategorie(req, res) {
  const categorieId = Number(req.params.categorieId);
  const { nom } = req.body;
  if (!nom || !nom.trim()) return res.status(400).json({ error: 'Le nom de la sous-catégorie est requis.' });

  const categorie = await prisma.categorieDepense.findUnique({ where: { id: categorieId } });
  if (!categorie) return res.status(404).json({ error: 'Catégorie introuvable.' });

  try {
    const sousCategorie = await prisma.sousCategorieDepense.create({
      data: { nom: nom.trim(), categorieId },
    });
    res.status(201).json(sousCategorie);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Cette sous-catégorie existe déjà dans cette catégorie.' });
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

// PUT /api/depenses/sous-categories/:id   { nom }   (ADMIN uniquement)
async function modifierSousCategorie(req, res) {
  const id = Number(req.params.id);
  const { nom } = req.body;
  if (!nom || !nom.trim()) return res.status(400).json({ error: 'Le nom de la sous-catégorie est requis.' });

  const sousCategorie = await prisma.sousCategorieDepense.findUnique({ where: { id } });
  if (!sousCategorie) return res.status(404).json({ error: 'Sous-catégorie introuvable.' });

  try {
    const misAJour = await prisma.sousCategorieDepense.update({ where: { id }, data: { nom: nom.trim() } });
    res.json(misAJour);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Cette sous-catégorie existe déjà dans cette catégorie.' });
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

// DELETE /api/depenses/sous-categories/:id   (ADMIN uniquement)
async function supprimerSousCategorie(req, res) {
  const id = Number(req.params.id);
  const sousCategorie = await prisma.sousCategorieDepense.findUnique({
    where: { id },
    include: { _count: { select: { depenses: true } } },
  });
  if (!sousCategorie) return res.status(404).json({ error: 'Sous-catégorie introuvable.' });
  if (sousCategorie._count.depenses > 0) {
    return res.status(400).json({ error: `Cette sous-catégorie est utilisée par ${sousCategorie._count.depenses} dépense(s), suppression impossible.` });
  }
  await prisma.sousCategorieDepense.delete({ where: { id } });
  res.json({ ok: true });
}

module.exports = {
  listerDepenses, creerDepense, listerCategories, creerCategorie, modifierCategorie, supprimerCategorie, syntheseBudget,
  creerSousCategorie, modifierSousCategorie, supprimerSousCategorie,
};