const prisma = require('../lib/prisma');

const MODULES = ['VENTES', 'STOCK', 'ARTICLES', 'DEPENSES', 'RAPPORTS', 'UTILISATEURS'];

// GET /api/roles
async function listerRoles(req, res) {
  const roles = await prisma.role.findMany({
    include: { permissions: true, _count: { select: { utilisateurs: true } } },
    orderBy: { estAdmin: 'desc' },
  });
  res.json(roles);
}

// POST /api/roles   { nom }
// Crée un nouveau rôle avec tous les modules décochés par défaut.
async function creerRole(req, res) {
  const { nom } = req.body;
  if (!nom || !nom.trim()) {
    return res.status(400).json({ error: 'Le nom du rôle est requis.' });
  }

  const existant = await prisma.role.findUnique({ where: { nom: nom.trim() } });
  if (existant) {
    return res.status(409).json({ error: 'Un rôle avec ce nom existe déjà.' });
  }

  const role = await prisma.role.create({
    data: {
      nom: nom.trim(),
      estAdmin: false,
      modifiable: true,
      permissions: {
        create: MODULES.map((module) => ({ module, actif: false })),
      },
    },
    include: { permissions: true },
  });
  res.status(201).json(role);
}

// PUT /api/roles/:id/permissions   { module, actif }
// Coche/décoche une case précise de la matrice pour ce rôle.
async function modifierPermission(req, res) {
  const id = Number(req.params.id);
  const { module, actif } = req.body;

  if (!MODULES.includes(module)) {
    return res.status(400).json({ error: 'Module invalide.' });
  }

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) return res.status(404).json({ error: 'Rôle introuvable.' });
  if (!role.modifiable) {
    return res.status(400).json({ error: 'Ce rôle (Administrateur) ne peut pas être modifié.' });
  }

  await prisma.rolePermission.upsert({
    where: { roleId_module: { roleId: id, module } },
    update: { actif: !!actif },
    create: { roleId: id, module, actif: !!actif },
  });

  const misAJour = await prisma.role.findUnique({ where: { id }, include: { permissions: true } });
  res.json(misAJour);
}

// PUT /api/roles/:id/plafond-remise   { plafondRemisePourcent }
// Règle le pourcentage de remise que ce rôle peut accorder sans PIN admin.
async function modifierPlafondRemise(req, res) {
  const id = Number(req.params.id);
  const { plafondRemisePourcent } = req.body;
  const valeur = Number(plafondRemisePourcent);

  if (Number.isNaN(valeur) || valeur < 0 || valeur > 100) {
    return res.status(400).json({ error: 'Le plafond doit être un pourcentage entre 0 et 100.' });
  }

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) return res.status(404).json({ error: 'Rôle introuvable.' });
  if (!role.modifiable) {
    return res.status(400).json({ error: 'Ce rôle (Administrateur) ne peut pas être modifié — il n\'a de toute façon aucun plafond.' });
  }

  const misAJour = await prisma.role.update({
    where: { id },
    data: { plafondRemisePourcent: valeur },
    include: { permissions: true },
  });
  res.json(misAJour);
}

// DELETE /api/roles/:id
// Refuse la suppression si le rôle est encore assigné à un ou plusieurs employés.
async function supprimerRole(req, res) {
  const id = Number(req.params.id);
  const role = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { utilisateurs: true } } },
  });
  if (!role) return res.status(404).json({ error: 'Rôle introuvable.' });
  if (!role.modifiable) {
    return res.status(400).json({ error: 'Ce rôle ne peut pas être supprimé.' });
  }
  if (role._count.utilisateurs > 0) {
    return res.status(400).json({ error: `Ce rôle est encore utilisé par ${role._count.utilisateurs} employé(s). Réassigne-les d'abord à un autre rôle.` });
  }

  await prisma.rolePermission.deleteMany({ where: { roleId: id } });
  await prisma.role.delete({ where: { id } });
  res.json({ ok: true });
}

module.exports = { listerRoles, creerRole, modifierPermission, modifierPlafondRemise, supprimerRole };