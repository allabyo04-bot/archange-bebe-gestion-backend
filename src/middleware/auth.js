const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Non authentifié.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, nomUtilisateur, role, permissions }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session invalide ou expirée.' });
  }
}

// Utilisation : requireRole('ADMIN') ou requireRole('ADMIN', 'CAISSIER')
// Conservé pour compatibilité, mais requireModule (ci-dessous) est à préférer désormais.
function requireRole(...rolesAutorises) {
  return (req, res, next) => {
    if (!req.user || !rolesAutorises.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé pour ce rôle.' });
    }
    next();
  };
}

// Utilisation : requireModule('STOCK')
// Vérifie que le module fait partie des permissions incluses dans le jeton de connexion.
// Un ADMIN "à l'ancienne" (compte jamais reconnecté depuis l'ajout du système de rôles)
// passe toujours, par sécurité, tant que tous les comptes ne sont pas migrés.
function requireModule(module) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié.' });
    }
    if (req.user.role === 'ADMIN') {
      return next();
    }
    const permissions = req.user.permissions || [];
    if (!permissions.includes(module)) {
      return res.status(403).json({ error: 'Accès refusé : ce rôle ne donne pas accès à ce module.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, requireModule };