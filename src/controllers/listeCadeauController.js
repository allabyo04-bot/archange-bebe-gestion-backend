const crypto = require('crypto');
const prisma = require('../lib/prisma');

function genererCodeAcces() {
  return crypto.randomBytes(6).toString('hex'); // ex: "a1b2c3d4e5f6"
}

// POST /api/listes-cadeaux   (interne, en boutique)
// body: { clientId, titre?, lignes: [{ articleId, quantiteSouhaitee }],
//         nomDestinataire?, telephoneDestinataire1?, telephoneDestinataire2?, emailDestinataire?,
//         nomDonateur?, telephoneDonateur?, emailDonateur? }
async function creerListeCadeau(req, res) {
  const {
    clientId, titre, lignes,
    nomDestinataire, telephoneDestinataire1, telephoneDestinataire2, emailDestinataire,
    nomDonateur, telephoneDonateur, emailDonateur,
  } = req.body;
  if (!clientId || !Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Client et au moins un article sont requis.' });
  }

  const liste = await prisma.listeCadeau.create({
    data: {
      clientId: Number(clientId),
      titre: titre || null,
      codeAcces: genererCodeAcces(),
      nomDestinataire: nomDestinataire || null,
      telephoneDestinataire1: telephoneDestinataire1 || null,
      telephoneDestinataire2: telephoneDestinataire2 || null,
      emailDestinataire: emailDestinataire || null,
      nomDonateur: nomDonateur || null,
      telephoneDonateur: telephoneDonateur || null,
      emailDonateur: emailDonateur || null,
      lignes: {
        create: lignes.map((l) => ({
          articleId: Number(l.articleId),
          quantiteSouhaitee: Number(l.quantiteSouhaitee),
        })),
      },
    },
    include: { lignes: { include: { article: true } }, client: true },
  });

  res.status(201).json(liste);
}

// GET /api/listes-cadeaux  (interne)
async function listerListesCadeaux(req, res) {
  const listes = await prisma.listeCadeau.findMany({
    include: { client: true, lignes: { include: { article: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(listes);
}

// GET /api/listes-cadeaux/publique/:codeAcces  (PUBLIC, sans authentification)
// Consultation par un proche qui a reçu le lien.
async function consulterListePublique(req, res) {
  const liste = await prisma.listeCadeau.findUnique({
    where: { codeAcces: req.params.codeAcces },
    include: { lignes: { include: { article: true } }, client: true },
  });
  if (!liste || !liste.actif) return res.status(404).json({ error: 'Liste cadeau introuvable.' });

  // On ne renvoie que le nécessaire publiquement (pas les coordonnées privées du destinataire)
  res.json({
    titre: liste.titre,
    client: { nomComplet: liste.client.nomComplet },
    lignes: liste.lignes.map((l) => ({
      id: l.id,
      article: { id: l.article.id, designation: l.article.designation, prixVente: l.article.prixVente },
      quantiteSouhaitee: l.quantiteSouhaitee,
      quantiteOfferte: l.quantiteOfferte,
      quantiteRestante: l.quantiteSouhaitee - l.quantiteOfferte,
    })),
  });
}

// Logique commune : offrir des articles d'une liste, payé soit par carte cadeau,
// soit par un autre mode de paiement déclaré (Espèces, Wave, Mobile Money...).
//
// Règles de confirmation :
//  - Carte cadeau (n'importe quel canal) -> vérifiée immédiatement en base -> CONFIRME direct
//  - Autre mode, canal "telephone" (la vendeuse a physiquement vérifié la réception avant
//    de saisir) -> CONFIRME direct
//  - Autre mode, canal "web" (déclaré à distance par un proche, aucune vérification possible
//    au moment de la saisie) -> EN_ATTENTE_VERIFICATION, à confirmer ensuite par Victoria
//
// Dans tous les cas, la quantité est réservée (quantiteOfferte incrémentée) immédiatement,
// pour éviter qu'un autre proche choisisse le même article entre-temps — même si la
// confirmation du paiement web est encore en attente.
async function offrirSurListe({ codeAcces, carteCadeauCode, modePaiement, montant, offrePar, canal, lignesChoisies }) {
  return prisma.$transaction(async (tx) => {
    const liste = await tx.listeCadeau.findUnique({
      where: { codeAcces },
      include: { lignes: { include: { article: true } } },
    });
    if (!liste || !liste.actif) throw new Error('Liste cadeau introuvable.');

    // Valeur réelle des articles/quantités choisis — sert à valider le montant déclaré pour
    // les paiements hors carte cadeau (la carte, elle, a une valeur fixe indépendante).
    let valeurLignesChoisies = 0;
    for (const choix of lignesChoisies) {
      const ligne = liste.lignes.find((l) => l.id === Number(choix.ligneId));
      if (!ligne) throw new Error(`Ligne ${choix.ligneId} absente de cette liste.`);
      valeurLignesChoisies += Number(ligne.article.prixVente) * Number(choix.quantite);
    }

    let carte = null;
    let statutConfirmation = 'CONFIRME';
    let montantUtilise;

    if (carteCadeauCode) {
      carte = await tx.carteCadeau.findUnique({ where: { codeBarre: carteCadeauCode } });
      if (!carte) throw new Error('Carte cadeau introuvable.');
      if (carte.statut !== 'ACTIVE') throw new Error("Cette carte cadeau n'est pas active.");
      montantUtilise = carte.denomination;
    } else if (modePaiement) {
      if (montant === undefined || montant === null || Number.isNaN(Number(montant))) {
        throw new Error('Montant invalide.');
      }
      // Tolérance d'arrondi de 1 franc ; au-delà, le montant déclaré doit correspondre
      // exactement à la valeur des articles sélectionnés — évite qu'on déclare un montant
      // arbitraire sans rapport avec ce qui est réellement offert.
      if (Math.abs(Number(montant) - valeurLignesChoisies) > 1) {
        throw new Error(
          `Le montant (${montant}) ne correspond pas à la valeur des articles sélectionnés (${valeurLignesChoisies}).`
        );
      }
      montantUtilise = valeurLignesChoisies;
      statutConfirmation = canal === 'web' ? 'EN_ATTENTE_VERIFICATION' : 'CONFIRME';
    } else {
      throw new Error('Indiquez une carte cadeau, ou un mode de paiement.');
    }

    for (const choix of lignesChoisies) {
      const ligne = liste.lignes.find((l) => l.id === Number(choix.ligneId));
      if (!ligne) throw new Error(`Ligne ${choix.ligneId} absente de cette liste.`);
      const restant = ligne.quantiteSouhaitee - ligne.quantiteOfferte;
      if (Number(choix.quantite) > restant) {
        throw new Error(`Quantité demandée supérieure à ce qu'il reste pour cet article.`);
      }
      await tx.ligneListeCadeau.update({
        where: { id: ligne.id },
        data: { quantiteOfferte: { increment: Number(choix.quantite) } },
      });
    }

    if (carte) {
      await tx.carteCadeau.update({ where: { id: carte.id }, data: { statut: 'UTILISEE' } });
      const cycleOuvert = await tx.carteCadeauCycle.findFirst({
        where: { carteCadeauId: carte.id, dateUtilisation: null },
        orderBy: { dateActivation: 'desc' },
      });
      if (cycleOuvert) {
        await tx.carteCadeauCycle.update({ where: { id: cycleOuvert.id }, data: { dateUtilisation: new Date() } });
      }
    }

    const offre = await tx.listeCadeauCarteUtilisee.create({
      data: {
        listeCadeauId: liste.id,
        carteCadeauId: carte ? carte.id : null,
        modePaiement: carte ? null : modePaiement,
        offrePar: offrePar || null,
        canal,
        montantUtilise,
        statutConfirmation,
        lignesCouvertes: {
          create: lignesChoisies.map((choix) => ({
            ligneListeCadeauId: Number(choix.ligneId),
            quantite: Number(choix.quantite),
          })),
        },
      },
      include: { lignesCouvertes: true },
    });

    return offre;
  }, { maxWait: 10000, timeout: 20000 });
}

// POST /api/listes-cadeaux/publique/:codeAcces/offrir  (PUBLIC)
// body: { carteCadeauCode? , modePaiement?, montant?, offrePar?, lignes: [{ ligneId, quantite }] }
// Soit carteCadeauCode est fourni (validation immédiate), soit modePaiement + montant
// (déclaratif, à vérifier par Victoria avant confirmation définitive).
async function offrirDepuisWeb(req, res) {
  const { carteCadeauCode, modePaiement, montant, offrePar, lignes } = req.body;
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Au moins un article choisi est requis.' });
  }
  if (!carteCadeauCode && !modePaiement) {
    return res.status(400).json({ error: 'Indiquez une carte cadeau ou un mode de paiement.' });
  }
  try {
    const resultat = await offrirSurListe({
      codeAcces: req.params.codeAcces, carteCadeauCode, modePaiement, montant,
      offrePar, canal: 'web', lignesChoisies: lignes,
    });
    res.status(201).json(resultat);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// POST /api/listes-cadeaux/:codeAcces/offrir-telephone  (interne, saisi par la vendeuse)
// La vendeuse a déjà vérifié la réception du paiement avant de saisir -> confirmé direct.
async function offrirParTelephone(req, res) {
  const { carteCadeauCode, modePaiement, montant, offrePar, lignes } = req.body;
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Au moins un article choisi est requis.' });
  }
  if (!carteCadeauCode && !modePaiement) {
    return res.status(400).json({ error: 'Indiquez une carte cadeau ou un mode de paiement.' });
  }
  try {
    const resultat = await offrirSurListe({
      codeAcces: req.params.codeAcces, carteCadeauCode, modePaiement, montant,
      offrePar, canal: 'telephone', lignesChoisies: lignes,
    });
    res.status(201).json(resultat);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// GET /api/listes-cadeaux/offres-en-attente  (interne, ADMIN)
// Toutes les offres déclarées à distance (canal web, mode de paiement non-carte) dont le
// paiement n'a pas encore été vérifié par Victoria.
async function listerOffresEnAttente(req, res) {
  const offres = await prisma.listeCadeauCarteUtilisee.findMany({
    where: { statutConfirmation: 'EN_ATTENTE_VERIFICATION' },
    include: {
      listeCadeau: { include: { client: true } },
      lignesCouvertes: { include: { ligneListeCadeau: { include: { article: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
  res.json(offres);
}

// POST /api/listes-cadeaux/offres/:id/confirmer  (interne, ADMIN)
// Victoria confirme avoir bien reçu le paiement déclaré.
async function confirmerOffre(req, res) {
  const id = Number(req.params.id);
  const utilisateurId = req.user.id;

  const offre = await prisma.listeCadeauCarteUtilisee.findUnique({ where: { id } });
  if (!offre) return res.status(404).json({ error: 'Offre introuvable.' });
  if (offre.statutConfirmation !== 'EN_ATTENTE_VERIFICATION') {
    return res.status(400).json({ error: 'Cette offre a déjà été traitée.' });
  }

  const misAJour = await prisma.listeCadeauCarteUtilisee.update({
    where: { id },
    data: { statutConfirmation: 'CONFIRME', validateurId: utilisateurId, dateValidation: new Date() },
  });
  res.json(misAJour);
}

// POST /api/listes-cadeaux/offres/:id/rejeter  (interne, ADMIN)
// Le paiement déclaré n'a en fait jamais été reçu : on rejette et on libère précisément les
// quantités réservées par cette offre, pour qu'un autre proche puisse offrir ces articles.
async function rejeterOffre(req, res) {
  const id = Number(req.params.id);
  const utilisateurId = req.user.id;
  const { motif } = req.body;

  try {
    const resultat = await prisma.$transaction(async (tx) => {
      const offre = await tx.listeCadeauCarteUtilisee.findUnique({
        where: { id },
        include: { lignesCouvertes: true },
      });
      if (!offre) throw new Error('Offre introuvable.');
      if (offre.statutConfirmation !== 'EN_ATTENTE_VERIFICATION') {
        throw new Error('Cette offre a déjà été traitée.');
      }

      for (const detail of offre.lignesCouvertes) {
        await tx.ligneListeCadeau.update({
          where: { id: detail.ligneListeCadeauId },
          data: { quantiteOfferte: { decrement: detail.quantite } },
        });
      }

      return tx.listeCadeauCarteUtilisee.update({
        where: { id },
        data: {
          statutConfirmation: 'REJETE',
          validateurId: utilisateurId,
          dateValidation: new Date(),
          offrePar: offre.offrePar ? `${offre.offrePar} (rejeté${motif ? ' - ' + motif : ''})` : null,
        },
      });
    }, { maxWait: 10000, timeout: 20000 });

    res.json(resultat);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = {
  creerListeCadeau, listerListesCadeaux, consulterListePublique, offrirDepuisWeb, offrirParTelephone,
  listerOffresEnAttente, confirmerOffre, rejeterOffre,
};
