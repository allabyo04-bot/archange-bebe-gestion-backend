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
  const where = {
    statut: 'VALIDEE',
    createdAt: { gte: debutAujourdhui(), lte: finAujourdhui() },
  };

  const [ventesDuJour, depensesDuJour, demandesRemiseEnAttente, recompensesEnAttente, ventesAvecRemiseMois] =
    await Promise.all([
      prisma.vente.findMany({ where }),
      prisma.depense.findMany({
        where: { dateDepense: { gte: debutAujourdhui(), lte: finAujourdhui() } },
      }),
      prisma.demandeRemise.count({ where: { statut: 'EN_ATTENTE' } }),
      prisma.recompenseFidelite.count({ where: { statut: 'EN_ATTENTE' } }),
      prisma.vente.findMany({
        where: { statut: 'VALIDEE', remiseMontant: { gt: 0 }, createdAt: { gte: debutMoisEnCours() } },
        select: { remiseMontant: true, createdAt: true },
      }),
    ]);

  // Prisma ne compare pas nativement deux colonnes entre elles (stockActuel <= seuilAlerte) ;
  // on filtre donc côté JS pour rester fiable sur toutes les versions.
  const tousArticles = await prisma.article.findMany({ where: { actif: true } });
  const articlesStockBas = tousArticles.filter((a) => a.stockActuel <= a.seuilAlerte);

  const totalVentes = ventesDuJour.reduce((s, v) => s + Number(v.totalNet), 0);
  const totalDepenses = depensesDuJour.reduce((s, d) => s + Number(d.montant), 0);

  const debutJour = debutAujourdhui();
  const remisesDuJour = ventesAvecRemiseMois.filter((v) => new Date(v.createdAt) >= debutJour);

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
  });
}

module.exports = { obtenirDashboard };
