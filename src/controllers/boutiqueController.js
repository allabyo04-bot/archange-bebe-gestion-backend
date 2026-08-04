const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

function genererNumeroCommande() {
  return `CMD-${Date.now()}`;
}

// ------------------------------------------------------------
// CATALOGUE (public, sans authentification)
// ------------------------------------------------------------

// GET /api/boutique/produits?q=&familleId=&sousFamilleId=&page=
async function listerProduits(req, res) {
  const { q, familleId, sousFamilleId } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const parPage = 24;

  const where = { actif: true };
  if (q) {
    where.OR = [
      { designation: { contains: q, mode: 'insensitive' } },
      { reference: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (familleId) where.familleId = Number(familleId);
  if (sousFamilleId) where.sousFamilleId = Number(sousFamilleId);

  const [total, articles] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      orderBy: { designation: 'asc' },
      skip: (page - 1) * parPage,
      take: parPage,
      select: {
        id: true, designation: true, reference: true, prixVente: true,
        photoUrl: true, stockActuel: true, familleId: true, sousFamilleId: true,
      },
    }),
  ]);

  res.json({
    produits: articles.map((a) => ({ ...a, enStock: a.stockActuel > 0 })),
    page,
    totalPages: Math.max(1, Math.ceil(total / parPage)),
    total,
  });
}

// GET /api/boutique/produits/:id
async function obtenirProduit(req, res) {
  const id = Number(req.params.id);
  const article = await prisma.article.findUnique({
    where: { id },
    include: { famille: true, sousFamille: true },
  });
  if (!article || !article.actif) return res.status(404).json({ error: 'Produit introuvable.' });
  res.json({ ...article, enStock: article.stockActuel > 0 });
}

// GET /api/boutique/familles — pour construire le menu de navigation du site
async function listerFamillesPubliques(req, res) {
  const familles = await prisma.famille.findMany({
    include: { sousFamilles: { select: { id: true, nom: true } } },
    orderBy: { nom: 'asc' },
  });
  res.json(familles);
}

// GET /api/boutique/lieux — boutiques disponibles pour le retrait
async function listerLieuxRetrait(req, res) {
  const lieux = await prisma.lieu.findMany({ where: { type: 'BOUTIQUE', actif: true }, select: { id: true, nom: true } });
  res.json(lieux);
}

// ------------------------------------------------------------
// COMPTE CLIENT
// ------------------------------------------------------------

// POST /api/boutique/compte/inscription   { nomComplet, telephone, email, motDePasse }
async function inscription(req, res) {
  const { nomComplet, telephone, email, motDePasse } = req.body;
  if (!nomComplet || !telephone || !motDePasse) {
    return res.status(400).json({ error: 'Nom, téléphone et mot de passe sont requis.' });
  }
  if (motDePasse.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères.' });
  }

  const existant = await prisma.client.findFirst({ where: { telephone } });
  if (existant && existant.motDePasse) {
    return res.status(409).json({ error: 'Un compte existe déjà avec ce numéro.' });
  }

  const hash = await bcrypt.hash(motDePasse, 10);
  let client;
  if (existant) {
    // Un client existant côté boutique physique (sans compte) peut activer un compte
    // avec les mêmes coordonnées — on ne perd pas son historique de fidélité.
    client = await prisma.client.update({ where: { id: existant.id }, data: { motDePasse: hash, email: email || existant.email } });
  } else {
    client = await prisma.client.create({ data: { nomComplet, telephone, email: email || null, motDePasse: hash } });
  }

  const token = genererTokenClient(client);
  res.status(201).json({ token, client: formaterClientPublic(client) });
}

// POST /api/boutique/compte/connexion   { telephone, motDePasse }
async function connexion(req, res) {
  const { telephone, motDePasse } = req.body;
  if (!telephone || !motDePasse) return res.status(400).json({ error: 'Téléphone et mot de passe sont requis.' });

  const client = await prisma.client.findFirst({ where: { telephone } });
  if (!client || !client.motDePasse || !(await bcrypt.compare(motDePasse, client.motDePasse))) {
    return res.status(401).json({ error: 'Identifiants incorrects.' });
  }

  const token = genererTokenClient(client);
  res.json({ token, client: formaterClientPublic(client) });
}

function genererTokenClient(client) {
  return jwt.sign({ clientId: client.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function formaterClientPublic(client) {
  return {
    id: client.id, nomComplet: client.nomComplet, telephone: client.telephone,
    email: client.email, pointsFidelite: client.pointsFidelite,
  };
}

// Middleware — authentification client optionnelle (commande invité acceptée)
async function authClientOptionnelle(req, res, next) {
  const entete = req.headers.authorization;
  if (!entete) { req.client = null; return next(); }
  try {
    const payload = jwt.verify(entete.replace('Bearer ', ''), process.env.JWT_SECRET);
    req.client = await prisma.client.findUnique({ where: { id: payload.clientId } });
  } catch {
    req.client = null;
  }
  next();
}

// GET /api/boutique/compte/moi — nécessite un token client valide
async function monCompte(req, res) {
  if (!req.client) return res.status(401).json({ error: 'Non connecté.' });
  res.json(formaterClientPublic(req.client));
}

// GET /api/boutique/compte/mes-commandes
async function mesCommandes(req, res) {
  if (!req.client) return res.status(401).json({ error: 'Non connecté.' });
  const commandes = await prisma.commandeEnLigne.findMany({
    where: { clientId: req.client.id },
    include: { lignes: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(commandes);
}

// ------------------------------------------------------------
// COMMANDE (invité ou compte)
// ------------------------------------------------------------

// POST /api/boutique/commandes
// body: { nomClient?, telephoneClient?, emailClient?, modeLivraison, lieuRetraitId?,
//         adresseLivraison?, villeLivraison?, notes?, lignes: [{ articleId, quantite }] }
async function creerCommande(req, res) {
  const {
    nomClient, telephoneClient, emailClient, modeLivraison,
    lieuRetraitId, adresseLivraison, villeLivraison, notes, lignes,
  } = req.body;

  if (!Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Le panier est vide.' });
  }
  if (!['RETRAIT', 'LIVRAISON'].includes(modeLivraison)) {
    return res.status(400).json({ error: 'Mode de livraison invalide.' });
  }
  if (modeLivraison === 'RETRAIT' && !lieuRetraitId) {
    return res.status(400).json({ error: 'Choisis une boutique de retrait.' });
  }
  if (modeLivraison === 'LIVRAISON' && (!adresseLivraison || !villeLivraison)) {
    return res.status(400).json({ error: 'Adresse et ville de livraison requises.' });
  }

  const nom = req.client ? req.client.nomComplet : nomClient;
  const telephone = req.client ? req.client.telephone : telephoneClient;
  const email = req.client ? req.client.email : (emailClient || null);
  if (!nom || !telephone) {
    return res.status(400).json({ error: 'Nom et téléphone sont requis.' });
  }

  const articleIds = lignes.map((l) => Number(l.articleId));
  const articles = await prisma.article.findMany({ where: { id: { in: articleIds }, actif: true } });
  const parId = Object.fromEntries(articles.map((a) => [a.id, a]));

  const lignesValidees = [];
  for (const ligne of lignes) {
    const article = parId[Number(ligne.articleId)];
    if (!article) return res.status(400).json({ error: `Article introuvable (id ${ligne.articleId}).` });
    const quantite = Math.max(1, Number(ligne.quantite) || 1);
    if (article.stockActuel < quantite) {
      return res.status(400).json({ error: `Stock insuffisant pour "${article.designation}".` });
    }
    lignesValidees.push({
      articleId: article.id,
      designation: article.designation,
      quantite,
      prixUnitaire: article.prixVente,
    });
  }

  const total = lignesValidees.reduce((s, l) => s + Number(l.prixUnitaire) * l.quantite, 0);

  const commande = await prisma.commandeEnLigne.create({
    data: {
      numero: genererNumeroCommande(),
      clientId: req.client ? req.client.id : null,
      nomClient: nom,
      telephoneClient: telephone,
      emailClient: email,
      modeLivraison,
      lieuRetraitId: modeLivraison === 'RETRAIT' ? Number(lieuRetraitId) : null,
      adresseLivraison: modeLivraison === 'LIVRAISON' ? adresseLivraison : null,
      villeLivraison: modeLivraison === 'LIVRAISON' ? villeLivraison : null,
      notes: notes || null,
      totalCommande: total,
      lignes: { create: lignesValidees },
    },
    include: { lignes: true },
  });

  res.status(201).json(commande);
}

// ------------------------------------------------------------
// ADMIN — gestion des commandes (staff connecté, pas le client)
// ------------------------------------------------------------

// GET /api/boutique/admin/commandes?statut=
async function listerCommandesAdmin(req, res) {
  const { statut } = req.query;
  const where = statut ? { statut } : {};
  const commandes = await prisma.commandeEnLigne.findMany({
    where,
    include: { lignes: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(commandes);
}

// PUT /api/boutique/admin/commandes/:id   { statut }
const STATUTS_VALIDES = ['EN_ATTENTE', 'CONFIRMEE', 'PRETE', 'LIVREE', 'ANNULEE'];
async function modifierStatutCommande(req, res) {
  const id = Number(req.params.id);
  const { statut } = req.body;
  if (!STATUTS_VALIDES.includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide.' });
  }
  try {
    const commande = await prisma.commandeEnLigne.update({ where: { id }, data: { statut } });
    res.json(commande);
  } catch {
    res.status(404).json({ error: 'Commande introuvable.' });
  }
}

module.exports = {
  listerProduits, obtenirProduit, listerFamillesPubliques, listerLieuxRetrait,
  inscription, connexion, authClientOptionnelle, monCompte, mesCommandes,
  creerCommande, listerCommandesAdmin, modifierStatutCommande,
};
