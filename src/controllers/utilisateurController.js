const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

// GET /api/utilisateurs
async function listerUtilisateurs(req, res) {
  const utilisateurs = await prisma.utilisateur.findMany({
    include: { lieu: true, roleDynamique: true },
    orderBy: { nomComplet: 'asc' },
  });
  const sansPin = utilisateurs.map(({ pin, ...reste }) => reste);
  res.json(sansPin);
}

// POST /api/utilisateurs   { nomUtilisateur, pin, nomComplet, roleId, lieuId? }
async function creerUtilisateur(req, res) {
  const { nomUtilisateur, pin, nomComplet, roleId, lieuId } = req.body;

  if (!nomUtilisateur || !pin || !nomComplet || !roleId) {
    return res.status(400).json({ error: "Nom d'utilisateur, PIN, nom complet et rôle sont requis." });
  }
  if (!/^\d{4,6}$/.test(pin)) {
    return res.status(400).json({ error: 'Le PIN doit comporter entre 4 et 6 chiffres.' });
  }

  const roleChoisi = await prisma.role.findUnique({ where: { id: Number(roleId) } });
  if (!roleChoisi) {
    return res.status(400).json({ error: 'Rôle invalide.' });
  }

  const existant = await prisma.utilisateur.findUnique({ where: { nomUtilisateur } });
  if (existant) {
    return res.status(409).json({ error: "Ce nom d'utilisateur existe déjà." });
  }

  const pinHache = await bcrypt.hash(pin, 10);

  // Le champ historique "role" (ADMIN/CAISSIER) reste rempli automatiquement à partir
  // du rôle dynamique choisi, pour ne rien casser dans le reste de l'appli qui s'appuie
  // encore dessus (bascule d'accès complet, badges, etc.).
  const utilisateur = await prisma.utilisateur.create({
    data: {
      nomUtilisateur,
      pin: pinHache,
      nomComplet,
      role: roleChoisi.estAdmin ? 'ADMIN' : 'CAISSIER',
      roleId: roleChoisi.id,
      lieuId: lieuId ? Number(lieuId) : null,
    },
    include: { lieu: true, roleDynamique: true },
  });

  const { pin: _omis, ...sansPin } = utilisateur;
  res.status(201).json(sansPin);
}

// PUT /api/utilisateurs/:id   { nomComplet?, roleId?, lieuId?, actif? }
async function modifierUtilisateur(req, res) {
  const id = Number(req.params.id);
  const { nomComplet, roleId, lieuId, actif } = req.body;

  const utilisateur = await prisma.utilisateur.findUnique({ where: { id } });
  if (!utilisateur) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  let nouveauRoleTexte = utilisateur.role;
  let nouveauRoleId = utilisateur.roleId;

  if (roleId !== undefined) {
    const roleChoisi = await prisma.role.findUnique({ where: { id: Number(roleId) } });
    if (!roleChoisi) {
      return res.status(400).json({ error: 'Rôle invalide.' });
    }
    nouveauRoleTexte = roleChoisi.estAdmin ? 'ADMIN' : 'CAISSIER';
    nouveauRoleId = roleChoisi.id;
  }

  const misAJour = await prisma.utilisateur.update({
    where: { id },
    data: {
      nomComplet: nomComplet ?? utilisateur.nomComplet,
      role: nouveauRoleTexte,
      roleId: nouveauRoleId,
      lieuId: lieuId !== undefined ? (lieuId ? Number(lieuId) : null) : utilisateur.lieuId,
      actif: actif !== undefined ? actif : utilisateur.actif,
    },
    include: { lieu: true, roleDynamique: true },
  });

  const { pin: _omis, ...sansPin } = misAJour;
  res.json(sansPin);
}

// POST /api/utilisateurs/:id/reinitialiser-pin   { pin }
async function reinitialiserPin(req, res) {
  const id = Number(req.params.id);
  const { pin } = req.body;

  if (!/^\d{4,6}$/.test(pin || '')) {
    return res.status(400).json({ error: 'Le PIN doit comporter entre 4 et 6 chiffres.' });
  }

  const utilisateur = await prisma.utilisateur.findUnique({ where: { id } });
  if (!utilisateur) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  const pinHache = await bcrypt.hash(pin, 10);
  await prisma.utilisateur.update({ where: { id }, data: { pin: pinHache } });

  res.json({ ok: true });
}

module.exports = { listerUtilisateurs, creerUtilisateur, modifierUtilisateur, reinitialiserPin };
