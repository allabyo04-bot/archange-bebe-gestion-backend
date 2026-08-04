const prisma = require('../lib/prisma');

function debutAujourdhui() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function finAujourdhui() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}
function debutMoisEnCours() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// GET /api/dashboard
async function obtenirDashboard(req, res) {
  // Un compte non-admin ne voit que les chiffres de SA boutique assignée ; un admin
  // voit toujours tout (lieuFiltre reste undefined dans ce cas).
  const lieuFiltre = req.user.role !== 'ADMIN' && req.user.lieuId ? req.user.lieuId : undefined;

  const where = {
    statut: 'VALIDEE',
    createdAt: { gte: debutAujourdhui(), lte: finAujourdhui() },
    ...(lieuFiltre ? { lieuId: lieuFiltre } : {}),
  };
  const whereDepenses = {
    dateDepense: { gte: debutAujourdhui(), lte: finAujourdhui() },
    ...(lieuFiltre ? { lieuId: lieuFiltre } : {}),
  };

  const [ventesDuJour, depensesDuJour, demandesRemiseEnAttente, recompensesEnAttente, ventesAvecRemiseMois] =
    await Promise.all([
      prisma.vente.findMany({ where }),
      prisma.depense.findMany({ where: whereDepenses }),
      prisma.demandeRemise.count({ where: { statut: 'EN_ATTENTE' } }),
      prisma.recompenseFidelite.count({ where: { statut: 'EN_ATTENTE' } }),
      prisma.vente.findMany({
        where: {
          statut: 'VALIDEE', remiseMontant: { gt: 0 }, createdAt: { gte: debutMoisEnCours() },
          ...(lieuFiltre ? { lieuId: lieuFiltre } : {}),
        },
        select: { remiseMontant: true, createdAt: true },
      }),
    ]);

  // Prisma ne compare pas nativement deux colonnes entre elles (stockActuel <= seuilAlerte) ;
  // on filtre donc côté JS pour rester fiable sur toutes les versions — mais on ne
  // charge que les colonnes utiles pour ne pas transporter tout l'article (~2500 lignes).
  const tousArticles = await prisma.article.findMany({
    where: { actif: true },
    select: { id: true, designation: true, stockActuel: true, seuilAlerte: true },
  });
  const articlesStockBas = tousArticles.filter((a) => a.stockActuel <= a.seuilAlerte);

  const totalVentes = ventesDuJour.reduce((s, v) => s + Number(v.totalNet), 0);
  const totalDepenses = depensesDuJour.reduce((s, d) => s + Number(d.montant), 0);

  const debutJour = debutAujourdhui();
  const remisesDuJour = ventesAvecRemiseMois.filter((v) => new Date(v.createdAt) >= debutJour);

  // Résultat du mois par boutique (réservé à l'admin côté frontend, mais calculé ici
  // pour toute boutique active — pas les entrepôts) : ventes − coût d'achat des
  // articles vendus − dépenses affectées à cette boutique, comparé à l'objectif fixé.
  const debutMois = debutMoisEnCours();
  const boutiques = await prisma.lieu.findMany({
    where: { type: 'BOUTIQUE', actif: true, ...(lieuFiltre ? { id: lieuFiltre } : {}) },
  });

  const parBoutique = await Promise.all(boutiques.map(async (b) => {
    const [lignesVenduesMois, depensesLieuMois, ventesLieuMois] = await Promise.all([
      prisma.ligneVente.findMany({
        where: { vente: { lieuId: b.id, statut: 'VALIDEE', createdAt: { gte: debutMois } } },
        select: { quantite: true, article: { select: { prixAchat: true } } },
      }),
      prisma.depense.findMany({
        where: { lieuId: b.id, dateDepense: { gte: debutMois } },
        select: { montant: true },
      }),
      prisma.vente.findMany({
        where: { lieuId: b.id, statut: 'VALIDEE', createdAt: { gte: debutMois } },
        select: { totalNet: true, createdAt: true },
      }),
    ]);
    // Le jour est toujours inclus dans le mois — pas besoin d'une requête séparée,
    // on filtre simplement ce qu'on a déjà en mémoire.
    const ventesLieuJour = ventesLieuMois.filter((v) => new Date(v.createdAt) >= debutJour);

    const totalVentesLieu = ventesLieuMois.reduce((s, v) => s + Number(v.totalNet), 0);
    const coutMarchandise = lignesVenduesMois.reduce((s, l) => s + l.quantite * Number(l.article.prixAchat), 0);
    const totalDepensesLieu = depensesLieuMois.reduce((s, d) => s + Number(d.montant), 0);
    const objectif = Number(b.objectifMensuel);

    return {
      lieuId: b.id,
      nom: b.nom,
      objectifMensuel: objectif,
      ventesJour: {
        nombre: ventesLieuJour.length,
        total: ventesLieuJour.reduce((s, v) => s + Number(v.totalNet), 0),
      },
      ventesMois: totalVentesLieu,
      pourcentageObjectif: objectif > 0 ? Math.round((totalVentesLieu / objectif) * 1000) / 10 : 0,
      coutMarchandiseMois: coutMarchandise,
      depensesMois: totalDepensesLieu,
      margeMois: totalVentesLieu - coutMarchandise - totalDepensesLieu,
    };
  }));

  // Ventes en ligne — uniquement les commandes "Livrées" comptent comme un vrai
  // chiffre d'affaires (une commande en attente peut encore être annulée). Affiché
  // séparément du CA boutique, jamais fusionné, pour ne pas fausser les chiffres
  // avec des commandes pas encore honorées. Réservé aux admins (le site n'est pas
  // rattaché à une boutique précise).
  let ventesEnLigne = null;
  if (!lieuFiltre) {
    const [commandesJour, commandesMois] = await Promise.all([
      prisma.commandeEnLigne.findMany({
        where: { statut: 'LIVREE', createdAt: { gte: debutJour } },
        select: { totalCommande: true },
      }),
      prisma.commandeEnLigne.findMany({
        where: { statut: 'LIVREE', createdAt: { gte: debutMois } },
        select: { totalCommande: true },
      }),
    ]);
    ventesEnLigne = {
      jour: { nombre: commandesJour.length, total: commandesJour.reduce((s, c) => s + Number(c.totalCommande), 0) },
      mois: { nombre: commandesMois.length, total: commandesMois.reduce((s, c) => s + Number(c.totalCommande), 0) },
    };
  }

  res.json({
    date: new Date().toISOString().slice(0, 10),
    ventes: { nombre: ventesDuJour.length, total: totalVentes },
    depenses: { nombre: depensesDuJour.length, total: totalDepenses },
    resultatJour: totalVentes - totalDepenses,
    alertesStock: articlesStockBas.map((a) => ({
      id: a.id, designation: a.designation, stockActuel: a.stockActuel, seuilAlerte: a.seuilAlerte,
    })),
    demandesRemiseEnAttente,
    recompensesFideliteEnAttente: recompensesEnAttente,
    remises: {
      jour: {
        nombre: remisesDuJour.length,
        total: remisesDuJour.reduce((s, v) => s + Number(v.remiseMontant), 0),
      },
      mois: {
        nombre: ventesAvecRemiseMois.length,
        total: ventesAvecRemiseMois.reduce((s, v) => s + Number(v.remiseMontant), 0),
      },
    },
    parBoutique,
    ventesEnLigne,
  });
}

module.exports = { obtenirDashboard };
