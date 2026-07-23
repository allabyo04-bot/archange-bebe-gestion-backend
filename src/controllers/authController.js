const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

// POST /api/auth/login  { nomUtilisateur, pin }
async function login(req, res) {
  const { nomUtilisateur, pin } = req.body;

  if (!nomUtilisateur || !pin) {
    return res.status(400).json({ error: "Nom d'utilisateur et PIN requis." });
  }

  const utilisateur = await prisma.utilisateur.findUnique({
    where: { nomUtilisateur },
    include: { roleDynamique: { include: { permissions: true } } },
  });

  if (!utilisateur || !utilisateur.actif) {
    return res.status(401).json({ error: 'Identifiants invalides.' });
  }

  const pinValide = await bcrypt.compare(pin, utilisateur.pin);
  if (!pinValide) {
    return res.status(401).json({ error: 'Identifiants invalides.' });
  }

  // Liste des modules autorisés, tirée du rôle dynamique si présent, sinon repli sur
  // l'ancien système fixe (ADMIN = tout, CAISSIER = Ventes+Dépenses) pour ne rien casser
  // tant que tous les comptes n'ont pas encore été migrés vers un rôle.
  let permissions;
  if (utilisateur.roleDynamique) {
    permissions = utilisateur.roleDynamique.permissions
      .filter((p) => p.actif)
      .map((p) => p.module);
  } else {
    permissions = utilisateur.role === 'ADMIN'
      ? ['VENTES', 'STOCK', 'ARTICLES', 'DEPENSES', 'RAPPORTS', 'UTILISATEURS']
      : ['VENTES', 'DEPENSES'];
  }

  const token = jwt.sign(
    {
      id: utilisateur.id,
      nomUtilisateur: utilisateur.nomUtilisateur,
      role: utilisateur.role,
      permissions,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.json({
    token,
    utilisateur: {
      id: utilisateur.id,
      nomUtilisateur: utilisateur.nomUtilisateur,
      nomComplet: utilisateur.nomComplet,
      role: utilisateur.role,
      roleNom: utilisateur.roleDynamique?.nom || null,
      permissions,
    },
  });
}

// GET /api/auth/me
async function me(req, res) {
  const utilisateur = await prisma.utilisateur.findUnique({
    where: { id: req.user.id },
    select: { id: true, nomUtilisateur: true, nomComplet: true, role: true, actif: true },
  });
  return res.json(utilisateur);
}

module.exports = { login, me };