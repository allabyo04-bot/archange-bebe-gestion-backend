const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { appliquerMouvementStock } = require('../lib/stock');
const { enregistrerActivite } = require('../lib/journal');

const SEUIL_FIDELITE_MONTANT = 20000;
const SEUIL_FIDELITE_ACHATS = 10;

function genererNumeroVente() {
  const maintenant = new Date();
  return `V-${maintenant.getTime()}`;
}

// Pourcentage de remise que l'utilisateur connecté peut accorder librement, sans PIN
// admin. Un ADMIN "à l'ancienne" (rôle natif) n'a pas de plafond. Un CAISSIER sans
// rôle dynamique assigné a un plafond de 0% (toute remise nécessite le PIN).
async function obtenirPlafondRemisePourcent(reqUser) {
  if (reqUser.role === 'ADMIN') return 100;
  const utilisateur = await prisma.utilisateur.findUnique({
    where: { id: reqUser.id },
    include: { roleDynamique: true },
  });
  if (!utilisateur?.roleDynamique) return 0;
  return Number(utilisateur.roleDynamique.plafondRemisePourcent);
}

// Vérifie un PIN contre tous les comptes ADMIN actifs (peu nombreux). Retourne le
// compte correspondant, ou null si aucun ne correspond.
async function verifierPinAdmin(pin) {
  if (!pin) return null;
  const admins = await prisma.utilisateur.findMany({ where: { role: 'ADMIN', actif: true } });
  for (const admin of admins) {
    if (await bcrypt.compare(pin, admin.pin)) return admin;
  }
  return null;
}

async function mettreAJourFidelite(tx, clientId, totalNet) {
  const client = await tx.client.findUnique({ where: { id: clientId } });
  if (!client || client.estComptoir) return;

  if (Number(totalNet) < SEUIL_FIDELITE_MONTANT) {
    await tx.client.update({
      where: { id: clientId },
      data: { achatsConsecutifs: 0, montantCumuleConsecutif: 0 },
    });
    return;
  }

  const nouveauCompteur = client.achatsConsecutifs + 1;
  const nouveauCumul = Number(client.montantCumuleConsecutif) + Number(totalNet);

  if (nouveauCompteur >= SEUIL_FIDELITE_ACHATS) {
    await tx.recompenseFidelite.create({
      data: { clientId, montantCumule: nouveauCumul },
    });
    await tx.client.update({
      where: { id: clientId },
      data: { achatsConsecutifs: 0, montantCumuleConsecutif: 0 },
    });
  } else {
    await tx.client.update({
      where: { id: clientId },
      data: { achatsConsecutifs: nouveauCompteur, montantCumuleConsecutif: nouveauCumul },
    });
  }
}

// POST /api/ventes
async function creerVente(req, res) {
  const {
    clientId, vendeurId, lieuId, remisePourcent, motifRemise, remisePin,
    carteCadeauCode, avoirCode, typeVente, lignes, paiements,
  } = req.body;
  const utilisateurId = req.user.id;

  const type = typeVente === 'CREDIT' ? 'CREDIT' : 'COMPTANT';

  if (!lieuId || !Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Lieu de vente et au moins une ligne sont requis.' });
  }
  if (!vendeurId) {
    return res.status(400).json({ error: 'Le vendeur est obligatoire.' });
  }

  // Une vente est toujours associée à un client, quitte à retomber sur "Client Comptoir"
  // si le frontend n'en a envoyé aucun (garde-fou côté serveur, en plus de celui du front).
  let clientIdFinal = clientId ? Number(clientId) : null;
  if (!clientIdFinal) {
    const comptoir = await prisma.client.findFirst({ where: { estComptoir: true } });
    if (!comptoir) {
      return res.status(400).json({ error: 'Aucun client sélectionné, et "Client Comptoir" n\'existe pas encore.' });
    }
    clientIdFinal = comptoir.id;
  }

  const listePaiements = Array.isArray(paiements) ? paiements : [];

  for (const p of listePaiements) {
    if (!p.mode || !(Number(p.montant) > 0)) {
      return res.status(400).json({ error: 'Chaque paiement doit avoir un mode et un montant positif.' });
    }
  }

  // La remise est saisie en % côté caisse ; le montant en F est toujours recalculé
  // ici (jamais fait confiance à un montant envoyé par le client) pour empêcher un
  // contournement du plafond via une requête modifiée.
  const totalHTBrut = lignes.reduce(
    (somme, l) => somme + Number(l.prixUnitaire) * Number(l.quantite) - Number(l.remiseLigne || 0),
    0
  );
  const pourcentageRemise = Math.min(Math.max(Number(remisePourcent) || 0, 0), 100);
  const remise = Math.round((totalHTBrut * pourcentageRemise) / 100);

  let autorisateurPin = null;
  if (remise > 0) {
    const plafond = await obtenirPlafondRemisePourcent(req.user);
    if (pourcentageRemise > plafond) {
      const admin = await verifierPinAdmin(remisePin);
      if (!admin) {
        return res.status(403).json({
          error: `Remise de ${pourcentageRemise}% au-delà du plafond autorisé (${plafond}%) — PIN administrateur requis.`,
          pinAdminRequis: true,
        });
      }
      autorisateurPin = admin;
    }
  }

  try {
    const resultat = await prisma.$transaction(async (tx) => {
      const totalHT = totalHTBrut;
      let totalNet = totalHT - remise;

      let avoir = null;
      let contributionAvoir = 0;
      if (avoirCode) {
        avoir = await tx.avoir.findUnique({ where: { reference: avoirCode } });
        if (!avoir) throw new Error('Avoir introuvable.');
        if (avoir.statut !== 'ACTIF') throw new Error("Cet avoir n'est pas actif (déjà utilisé).");
        contributionAvoir = Math.min(Number(avoir.montant), totalNet);
      }

      const totalPaiements = listePaiements.reduce((s, p) => s + Number(p.montant), 0);
      const totalCouvert = totalPaiements + contributionAvoir;
      const resteApresPaiements = totalNet - totalCouvert;

      if (type === 'COMPTANT') {
        if (Math.abs(resteApresPaiements) > 1) {
          throw new Error(
            resteApresPaiements > 0
              ? `Il manque ${resteApresPaiements.toFixed(2)} F pour couvrir le total.`
              : `Le total des paiements dépasse le montant de ${Math.abs(resteApresPaiements).toFixed(2)} F.`
          );
        }
      } else {
        if (resteApresPaiements < -1) {
          throw new Error(`Le total des paiements dépasse le montant de ${Math.abs(resteApresPaiements).toFixed(2)} F.`);
        }
      }
      if (type === 'COMPTANT' && listePaiements.length === 0 && contributionAvoir === 0) {
        throw new Error('Ajoutez au moins un mode de paiement.');
      }

      let carteCadeau = null;
      if (carteCadeauCode) {
        carteCadeau = await tx.carteCadeau.findUnique({ where: { codeBarre: carteCadeauCode } });
        if (!carteCadeau) throw new Error('Carte cadeau introuvable.');
        if (carteCadeau.statut !== 'ACTIVE') throw new Error("Cette carte cadeau n'est pas active.");
      }

      const modePaiementResume =
        listePaiements.map((p) => p.mode).join(', ') +
        (avoir ? (listePaiements.length ? ', Avoir' : 'Avoir') : '') ||
        (type === 'CREDIT' ? 'Crédit' : '');

      const vente = await tx.vente.create({
        data: {
          numero: genererNumeroVente(),
          clientId: clientIdFinal,
          vendeurId: vendeurId ? Number(vendeurId) : null,
          lieuId: Number(lieuId),
          utilisateurId,
          typeVente: type,
          totalHT,
          remiseMontant: remise,
          remisePourcent: remise > 0 ? pourcentageRemise : null,
          totalNet,
          modePaiement: modePaiementResume,
          carteCadeauUtiliseeId: carteCadeau ? carteCadeau.id : null,
          avoirUtiliseId: avoir ? avoir.id : null,
          lignes: {
            create: lignes.map((l) => ({
              articleId: Number(l.articleId),
              quantite: Number(l.quantite),
              prixUnitaire: l.prixUnitaire,
              remiseLigne: l.remiseLigne || 0,
            })),
          },
          paiements: {
            create: listePaiements.map((p) => ({
              mode: p.mode,
              montant: Number(p.montant),
            })),
          },
        },
        include: { lignes: true, paiements: true },
      });

      for (const ligne of vente.lignes) {
        try {
          await appliquerMouvementStock(tx, {
            articleId: ligne.articleId,
            lieuId: Number(lieuId),
            delta: -ligne.quantite,
            type: 'SORTIE_VENTE',
            utilisateurId,
            refVenteId: vente.id,
            notes: `Vente ${vente.numero}`,
          });
        } catch (err) {
          if (err.message.startsWith('Stock insuffisant')) {
            const [article, lieu] = await Promise.all([
              tx.article.findUnique({ where: { id: ligne.articleId } }),
              tx.lieu.findUnique({ where: { id: Number(lieuId) } }),
            ]);
            throw new Error(
              `Stock insuffisant pour "${article?.designation || ligne.articleId}" à ${lieu?.nom || 'cette boutique'} — vérifie la quantité disponible avant de valider.`
            );
          }
          throw err;
        }
      }

      if (carteCadeau) {
        await tx.carteCadeau.update({
          where: { id: carteCadeau.id },
          data: { statut: 'UTILISEE' },
        });
        const cycleOuvert = await tx.carteCadeauCycle.findFirst({
          where: { carteCadeauId: carteCadeau.id, dateUtilisation: null },
          orderBy: { dateActivation: 'desc' },
        });
        if (cycleOuvert) {
          await tx.carteCadeauCycle.update({
            where: { id: cycleOuvert.id },
            data: { dateUtilisation: new Date() },
          });
        }
      }

      if (avoir) {
        await tx.avoir.update({
          where: { id: avoir.id },
          data: { statut: 'UTILISE', dateUtilisation: new Date() },
        });
      }

      if (remise > 0) {
        await tx.demandeRemise.create({
          data: {
            venteId: vente.id,
            demandeurId: utilisateurId,
            montantDemande: remise,
            motif: motifRemise || null,
            statut: 'APPROUVEE',
            approbateurId: autorisateurPin ? autorisateurPin.id : null,
            resolvedAt: new Date(),
          },
        });
        if (autorisateurPin) {
          await enregistrerActivite(tx, {
            type: 'REMISE_APPROUVEE',
            description: `Remise de ${pourcentageRemise}% (${remise.toLocaleString('fr-FR')} F) débloquée par PIN admin (${autorisateurPin.nomComplet}) sur la vente ${vente.numero}`,
            utilisateurId,
          });
        }
      }

      await mettreAJourFidelite(tx, clientIdFinal, totalNet);

      return vente;
    }, { maxWait: 10000, timeout: 20000 });

    res.status(201).json(resultat);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// POST /api/ventes/:id/demander-annulation   { motif }
async function demanderAnnulation(req, res) {
  const id = Number(req.params.id);
  const { motif } = req.body;
  const utilisateurId = req.user.id;

  const vente = await prisma.vente.findUnique({ where: { id } });
  if (!vente) return res.status(404).json({ error: 'Vente introuvable.' });
  if (vente.statut === 'ANNULEE') return res.status(400).json({ error: 'Cette vente est déjà annulée.' });
  if (vente.demandeAnnulationEnCours) return res.status(400).json({ error: 'Une demande est déjà en attente pour cette vente.' });

  const misAJour = await prisma.vente.update({
    where: { id },
    data: {
      demandeAnnulationEnCours: true,
      motifDemandeAnnulation: motif || null,
      demandeurAnnulationId: utilisateurId,
      dateDemandeAnnulation: new Date(),
    },
  });

  res.json(misAJour);
}

// GET /api/ventes/demandes-annulation   (ADMIN uniquement)
async function listerDemandesAnnulation(req, res) {
  const ventes = await prisma.vente.findMany({
    where: { demandeAnnulationEnCours: true },
    include: {
      lignes: { include: { article: true } },
      client: true,
      vendeur: true,
      lieu: true,
      demandeurAnnulation: true,
    },
    orderBy: { dateDemandeAnnulation: 'desc' },
  });
  res.json(ventes);
}

// POST /api/ventes/:id/rejeter-annulation   (ADMIN uniquement)
async function rejeterAnnulation(req, res) {
  const id = Number(req.params.id);
  const vente = await prisma.vente.findUnique({ where: { id } });
  if (!vente) return res.status(404).json({ error: 'Vente introuvable.' });

  const misAJour = await prisma.vente.update({
    where: { id },
    data: {
      demandeAnnulationEnCours: false,
      motifDemandeAnnulation: null,
      demandeurAnnulationId: null,
      dateDemandeAnnulation: null,
    },
  });

  res.json(misAJour);
}

// POST /api/ventes/:id/annuler   body: { motif }   (ADMIN uniquement)
async function annulerVente(req, res) {
  const id = Number(req.params.id);
  const { motif } = req.body;
  const utilisateurId = req.user.id;

  try {
    const resultat = await prisma.$transaction(async (tx) => {
      const vente = await tx.vente.findUnique({ where: { id }, include: { lignes: true } });
      if (!vente) throw new Error('Vente introuvable.');
      if (vente.statut === 'ANNULEE') throw new Error('Cette vente est déjà annulée.');

      for (const ligne of vente.lignes) {
        await appliquerMouvementStock(tx, {
          articleId: ligne.articleId,
          lieuId: vente.lieuId,
          delta: ligne.quantite,
          type: 'ANNULATION_VENTE',
          utilisateurId,
          refVenteId: vente.id,
          notes: `Annulation vente ${vente.numero}${motif ? ' - ' + motif : ''}`,
        });
      }

      if (vente.carteCadeauUtiliseeId) {
        await tx.carteCadeau.update({
          where: { id: vente.carteCadeauUtiliseeId },
          data: { statut: 'ACTIVE' },
        });
        const dernierCycle = await tx.carteCadeauCycle.findFirst({
          where: { carteCadeauId: vente.carteCadeauUtiliseeId },
          orderBy: { dateActivation: 'desc' },
        });
        if (dernierCycle) {
          await tx.carteCadeauCycle.update({
            where: { id: dernierCycle.id },
            data: { dateUtilisation: null },
          });
        }
      }

      if (vente.avoirUtiliseId) {
        await tx.avoir.update({
          where: { id: vente.avoirUtiliseId },
          data: { statut: 'ACTIF', dateUtilisation: null },
        });
      }

      await enregistrerActivite(tx, {
        type: 'ANNULATION_VENTE',
        description: `Vente ${vente.numero} annulée (${Number(vente.totalNet).toLocaleString('fr-FR')} F)${motif ? ' — motif : ' + motif : ''}`,
        utilisateurId,
      });

      return tx.vente.update({
        where: { id },
        data: {
          statut: 'ANNULEE',
          dateAnnulation: new Date(),
          motifAnnulation: motif || vente.motifDemandeAnnulation || null,
          demandeAnnulationEnCours: false,
          motifDemandeAnnulation: null,
          demandeurAnnulationId: null,
          dateDemandeAnnulation: null,
        },
      });
    }, { maxWait: 10000, timeout: 20000 });

    res.json(resultat);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// GET /api/ventes?statut=&lieuId=&clientId=
// Un caissier (non-ADMIN) ne voit jamais que les ventes du jour en cours, quels que
// soient les paramètres envoyés — c'est imposé ici côté serveur, pas juste caché
// côté écran, pour qu'il n'y ait aucun moyen de contourner cette limite.
async function listerVentes(req, res) {
  const { statut, lieuId, clientId } = req.query;
  const where = {};
  if (statut) where.statut = statut;
  if (lieuId) where.lieuId = Number(lieuId);
  if (clientId) where.clientId = Number(clientId);

  if (req.user.role !== 'ADMIN') {
    const debut = new Date();
    debut.setHours(0, 0, 0, 0);
    const fin = new Date();
    fin.setHours(23, 59, 59, 999);
    where.createdAt = { gte: debut, lte: fin };
  }

  const ventes = await prisma.vente.findMany({
    where,
    include: {
      lignes: { include: { article: true } },
      paiements: true,
      client: true,
      vendeur: true,
      utilisateur: true,
      lieu: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(ventes);
}

module.exports = {
  creerVente, annulerVente, listerVentes,
  demanderAnnulation, listerDemandesAnnulation, rejeterAnnulation,
};
