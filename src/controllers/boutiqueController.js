const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const jeko = require('../lib/jeko');
const { appliquerMouvementStock } = require('../lib/stock');

function genererNumeroCommande() {
  return `CMD-${Date.now()}`;
}

// ------------------------------------------------------------
// CATALOGUE (public, sans authentification)
// ------------------------------------------------------------

// GET /api/boutique/produits?q=&familleId=&sousFamilleId=&enPromo=&page=
async function listerProduits(req, res) {
  const { q, familleId, sousFamilleId, enPromo, tri } = req.query;
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
  if (enPromo === 'true') where.prixPromo = { not: null };

  const tris = {
    'prix-asc': { prixVente: 'asc' },
    'prix-desc': { prixVente: 'desc' },
    'nouveaute': { createdAt: 'desc' },
    'nom': { designation: 'asc' },
  };
  const orderBy = tris[tri] || tris.nom;

  const [total, articles] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      orderBy,
      skip: (page - 1) * parPage,
      take: parPage,
      select: {
        id: true, designation: true, reference: true, prixVente: true, prixPromo: true,
        photoUrl: true, stockActuel: true, familleId: true, sousFamilleId: true, createdAt: true,
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
    include: { famille: true, sousFamille: true, photos: { orderBy: { ordre: 'asc' } } },
  });
  if (!article || !article.actif) return res.status(404).json({ error: 'Produit introuvable.' });
  const description = article.description || article.sousFamille?.description || null;
  res.json({ ...article, enStock: article.stockActuel > 0, description });
}

// GET /api/boutique/produits/:id/similaires
// Autres articles de la même sous-famille (à défaut, même famille), pour la fiche produit.
async function produitsSimilaires(req, res) {
  const id = Number(req.params.id);
  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) return res.status(404).json({ error: 'Produit introuvable.' });

  const selectChamps = {
    id: true, designation: true, prixVente: true, prixPromo: true, photoUrl: true, stockActuel: true,
  };

  let similaires = [];
  if (article.sousFamilleId) {
    similaires = await prisma.article.findMany({
      where: { sousFamilleId: article.sousFamilleId, actif: true, id: { not: id } },
      select: selectChamps,
      take: 8,
    });
  }
  if (similaires.length < 4 && article.familleId) {
    const complement = await prisma.article.findMany({
      where: {
        familleId: article.familleId, actif: true, id: { not: id },
        ...(similaires.length ? { id: { notIn: [id, ...similaires.map((s) => s.id)] } } : {}),
      },
      select: selectChamps,
      take: 8 - similaires.length,
    });
    similaires = [...similaires, ...complement];
  }

  res.json(similaires.map((a) => ({ ...a, enStock: a.stockActuel > 0 })));
}

// GET /api/boutique/produits/:id/avis
async function listerAvisProduit(req, res) {
  const articleId = Number(req.params.id);
  const avis = await prisma.avisArticle.findMany({
    where: { articleId },
    orderBy: { createdAt: 'desc' },
  });
  const moyenne = avis.length
    ? Math.round((avis.reduce((s, a) => s + a.note, 0) / avis.length) * 10) / 10
    : null;
  res.json({ avis, moyenne, total: avis.length });
}

// POST /api/boutique/produits/:id/avis  { nomClient, note, commentaire }
async function ajouterAvisProduit(req, res) {
  const articleId = Number(req.params.id);
  const { nomClient, note, commentaire } = req.body;

  if (!nomClient || !nomClient.trim()) {
    return res.status(400).json({ error: 'Votre nom est requis.' });
  }
  const noteNum = Number(note);
  if (!noteNum || noteNum < 1 || noteNum > 5) {
    return res.status(400).json({ error: 'La note doit être comprise entre 1 et 5.' });
  }
  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article) return res.status(404).json({ error: 'Produit introuvable.' });

  const avis = await prisma.avisArticle.create({
    data: {
      articleId,
      nomClient: nomClient.trim().slice(0, 100),
      note: noteNum,
      commentaire: commentaire && commentaire.trim() ? commentaire.trim().slice(0, 1000) : null,
    },
  });
  res.status(201).json(avis);
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
    lieuRetraitId, adresseLivraison, villeLivraison, notes, lignes, modePaiement,
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
  const paiementEnLigne = modePaiement === 'JEKO';
  if (paiementEnLigne && !jeko.estConfigure()) {
    return res.status(400).json({ error: "Le paiement en ligne n'est pas disponible pour le moment. Choisis \"Paiement à la livraison\"." });
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
      prixUnitaire: article.prixPromo ?? article.prixVente,
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
      modePaiement: paiementEnLigne ? 'JEKO' : 'A_LA_LIVRAISON',
      lignes: { create: lignesValidees },
    },
    include: { lignes: true },
  });

  if (!paiementEnLigne) {
    return res.status(201).json(commande);
  }

  // Paiement en ligne demandé : on crée le lien JEKO et on le renvoie au site pour
  // rediriger le client. La commande existe déjà (statut EN_ATTENTE, paiementRecu false)
  // — si la création du lien échoue, la commande reste utilisable en "paiement à la
  // livraison" plutôt que d'être perdue.
  try {
    const lien = await jeko.creerLienPaiement({
      titre: `Commande ${commande.numero} — Archange Bébé`,
      montantXof: total,
    });
    const commandeAvecLien = await prisma.commandeEnLigne.update({
      where: { id: commande.id },
      data: { jekoPaymentLinkId: lien.id, jekoPaymentUrl: lien.link },
      include: { lignes: true },
    });
    res.status(201).json(commandeAvecLien);
  } catch (err) {
    console.error(`Échec création lien JEKO pour commande ${commande.numero} :`, err.message);
    res.status(201).json({ ...commande, erreurPaiement: err.message });
  }
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

// PUT /api/boutique/admin/commandes/:id   { statut, lieuSortieId? }
// lieuSortieId n'est nécessaire que pour une commande en livraison (pas de retrait
// boutique connu) qu'on confirme pour la première fois — sinon ignoré.
const STATUTS_VALIDES = ['EN_ATTENTE', 'CONFIRMEE', 'PRETE', 'LIVREE', 'ANNULEE'];
const STATUTS_ACTIFS = ['CONFIRMEE', 'PRETE', 'LIVREE']; // déclenchent la sortie de stock, une seule fois

async function modifierStatutCommande(req, res) {
  const id = Number(req.params.id);
  const { statut, lieuSortieId } = req.body;
  if (!STATUTS_VALIDES.includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide.' });
  }

  const commande = await prisma.commandeEnLigne.findUnique({ where: { id }, include: { lignes: true } });
  if (!commande) return res.status(404).json({ error: 'Commande introuvable.' });

  try {
    // Première bascule vers un statut actif : on sort le stock, une seule fois.
    if (STATUTS_ACTIFS.includes(statut) && !commande.stockDecompte) {
      const lieuSortie = commande.lieuRetraitId || (lieuSortieId ? Number(lieuSortieId) : null);
      if (!lieuSortie) {
        return res.status(400).json({
          error: "Cette commande est en livraison — précise depuis quelle boutique/entrepôt sortir le stock (lieuSortieId).",
        });
      }

      await prisma.$transaction(async (tx) => {
        for (const ligne of commande.lignes) {
          await appliquerMouvementStock(tx, {
            articleId: ligne.articleId,
            lieuId: lieuSortie,
            delta: -ligne.quantite,
            type: 'SORTIE_SITE',
            utilisateurId: req.user.id,
            notes: `Commande en ligne ${commande.numero}`,
          });
        }
        await tx.commandeEnLigne.update({
          where: { id },
          data: { statut, stockDecompte: true, lieuSortieId: lieuSortie },
        });
      });
    } else if (statut === 'ANNULEE' && commande.stockDecompte && commande.lieuSortieId) {
      // On annule après que le stock ait déjà été sorti : on le remet exactement
      // là où il avait été prélevé.
      await prisma.$transaction(async (tx) => {
        for (const ligne of commande.lignes) {
          await appliquerMouvementStock(tx, {
            articleId: ligne.articleId,
            lieuId: commande.lieuSortieId,
            delta: ligne.quantite,
            type: 'ANNULATION_SORTIE_SITE',
            utilisateurId: req.user.id,
            notes: `Annulation commande en ligne ${commande.numero}`,
          });
        }
        await tx.commandeEnLigne.update({ where: { id }, data: { statut, stockDecompte: false } });
      });
    } else {
      await prisma.commandeEnLigne.update({ where: { id }, data: { statut } });
    }

    const commandeMiseAJour = await prisma.commandeEnLigne.findUnique({ where: { id } });
    res.json(commandeMiseAJour);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// GET /api/boutique/commandes/:numero/statut-paiement  (public — pas d'authentification)
// Utilisé par la page de confirmation du site pour savoir si le paiement JEKO a été
// reçu (source de vérité = paiementRecu, mis à jour uniquement par le webhook JEKO,
// jamais par le client). N'expose que le strict nécessaire, pas la commande entière.
async function obtenirStatutPaiementCommande(req, res) {
  const commande = await prisma.commandeEnLigne.findUnique({ where: { numero: req.params.numero } });
  if (!commande) return res.status(404).json({ error: 'Commande introuvable.' });
  res.json({
    numero: commande.numero,
    modePaiement: commande.modePaiement,
    paiementRecu: commande.paiementRecu,
    jekoPaymentUrl: commande.jekoPaymentUrl,
  });
}

// GET /api/boutique/jeko-disponible  (public)
// Permet au site de savoir s'il doit proposer l'option "Payer en ligne" (clés JEKO
// configurées côté serveur) sans jamais exposer les clés elles-mêmes.
async function jekoDisponible(req, res) {
  res.json({ disponible: jeko.estConfigure() });
}

// POST /api/boutique/commandes/:numero/relancer-paiement  (public)
// Retente la création du lien JEKO pour une commande dont le paiement en ligne a
// échoué à se créer la première fois (ex: souci réseau/API JEKO ponctuel). N'a d'effet
// que sur une commande JEKO pas encore payée — inoffensif à rappeler plusieurs fois.
async function relancerPaiementCommande(req, res) {
  const commande = await prisma.commandeEnLigne.findUnique({ where: { numero: req.params.numero } });
  if (!commande) return res.status(404).json({ error: 'Commande introuvable.' });
  if (commande.modePaiement !== 'JEKO') return res.status(400).json({ error: "Cette commande n'est pas en paiement en ligne." });
  if (commande.paiementRecu) return res.status(400).json({ error: 'Cette commande est déjà payée.' });

  try {
    const lien = await jeko.creerLienPaiement({
      titre: `Commande ${commande.numero} — Archange Bébé`,
      montantXof: Number(commande.totalCommande),
    });
    const misAJour = await prisma.commandeEnLigne.update({
      where: { id: commande.id },
      data: { jekoPaymentLinkId: lien.id, jekoPaymentUrl: lien.link },
    });
    res.json({ jekoPaymentUrl: misAJour.jekoPaymentUrl });
  } catch (err) {
    console.error(`Échec relance lien JEKO pour commande ${commande.numero} :`, err.message);
    res.status(500).json({ error: "Le paiement en ligne est momentanément indisponible. Réessaie dans un instant, ou contacte la boutique." });
  }
}

module.exports = {
  listerProduits, obtenirProduit, listerFamillesPubliques, listerLieuxRetrait,
  inscription, connexion, authClientOptionnelle, monCompte, mesCommandes,
  creerCommande, listerCommandesAdmin, modifierStatutCommande,
  obtenirStatutPaiementCommande, jekoDisponible, relancerPaiementCommande,
  produitsSimilaires, listerAvisProduit, ajouterAvisProduit,
};
