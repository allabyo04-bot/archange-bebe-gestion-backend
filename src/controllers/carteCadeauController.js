const prisma = require('../lib/prisma');

// GET /api/cartes-cadeaux/denominations
async function listerDenominations(req, res) {
  const denominations = await prisma.denominationCarteCadeau.findMany({
    where: { actif: true },
    orderBy: { montant: 'asc' },
  });
  res.json(denominations);
}

// GET /api/cartes-cadeaux/denominations/toutes  (ADMIN — inclut les désactivées, pour l'écran de gestion)
async function listerToutesDenominations(req, res) {
  const denominations = await prisma.denominationCarteCadeau.findMany({
    orderBy: { montant: 'asc' },
  });
  res.json(denominations);
}

// POST /api/cartes-cadeaux/denominations   { montant }
async function creerDenomination(req, res) {
  const { montant } = req.body;
  if (!montant || Number(montant) <= 0) return res.status(400).json({ error: 'Montant requis.' });
  try {
    const denomination = await prisma.denominationCarteCadeau.create({ data: { montant: Number(montant) } });
    res.status(201).json(denomination);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Cette dénomination existe déjà.' });
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

// PUT /api/cartes-cadeaux/denominations/:id   { actif }
async function modifierDenomination(req, res) {
  const id = Number(req.params.id);
  const { actif } = req.body;
  const denomination = await prisma.denominationCarteCadeau.findUnique({ where: { id } });
  if (!denomination) return res.status(404).json({ error: 'Dénomination introuvable.' });

  const misAJour = await prisma.denominationCarteCadeau.update({
    where: { id },
    data: { actif: actif !== undefined ? actif : denomination.actif },
  });
  res.json(misAJour);
}

// GET /api/cartes-cadeaux/:codeBarre
async function obtenirCarteCadeau(req, res) {
  const carte = await prisma.carteCadeau.findUnique({
    where: { codeBarre: req.params.codeBarre },
    include: { cycles: { include: { lieu: true }, orderBy: { dateActivation: 'desc' } } },
  });
  if (!carte) return res.status(404).json({ error: 'Carte cadeau introuvable.' });
  res.json(carte);
}

// POST /api/cartes-cadeaux/activer   { codeBarre, denomination, lieuId, modePaiement }
// L'argent reçu à l'activation est désormais tracé (boutique + mode de paiement), pour
// apparaître dans États comme un vrai encaissement — avant, il n'était nulle part suivi.
async function activerCarteCadeau(req, res) {
  const { codeBarre, denomination, lieuId, modePaiement } = req.body;
  const utilisateurId = req.user.id;

  if (!codeBarre || !denomination) {
    return res.status(400).json({ error: 'Code-barres et dénomination requis.' });
  }
  if (!lieuId) {
    return res.status(400).json({ error: 'La boutique est requise.' });
  }
  if (!modePaiement) {
    return res.status(400).json({ error: 'Le mode de paiement est requis.' });
  }

  const denominationValide = await prisma.denominationCarteCadeau.findUnique({
    where: { montant: denomination },
  });
  if (!denominationValide || !denominationValide.actif) {
    return res.status(400).json({ error: "Cette dénomination n'est pas dans la liste autorisée." });
  }

  try {
    const resultat = await prisma.$transaction(async (tx) => {
      let carte = await tx.carteCadeau.findUnique({ where: { codeBarre } });

      if (!carte) {
        carte = await tx.carteCadeau.create({
          data: { codeBarre, denomination, statut: 'ACTIVE' },
        });
      } else {
        if (carte.statut === 'ACTIVE') {
          throw new Error('Cette carte est déjà active.');
        }
        carte = await tx.carteCadeau.update({
          where: { id: carte.id },
          data: { denomination, statut: 'ACTIVE' },
        });
      }

      await tx.carteCadeauCycle.create({
        data: {
          carteCadeauId: carte.id,
          denomination,
          utilisateurId,
          lieuId: Number(lieuId),
          modePaiement,
        },
      });

      return carte;
    }, { maxWait: 10000, timeout: 20000 });

    res.json(resultat);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// GET /api/cartes-cadeaux
async function listerCartesCadeaux(req, res) {
  const { statut } = req.query;
  const where = statut ? { statut } : {};
  const cartes = await prisma.carteCadeau.findMany({ where, orderBy: { createdAt: 'desc' } });
  res.json(cartes);
}

module.exports = {
  listerDenominations, listerToutesDenominations, creerDenomination, modifierDenomination,
  obtenirCarteCadeau, activerCarteCadeau, listerCartesCadeaux,
};
