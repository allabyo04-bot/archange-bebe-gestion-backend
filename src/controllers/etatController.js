const prisma = require('../lib/prisma');

function debutJournee(date) {
  const d = date ? new Date(date) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function finJournee(date) {
  const d = date ? new Date(date) : new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function construirePeriode(dateDebut, dateFin) {
  const where = {};
  if (dateDebut || dateFin) {
    where.createdAt = {};
    if (dateDebut) where.createdAt.gte = debutJournee(dateDebut);
    if (dateFin) where.createdAt.lte = finJournee(dateFin);
  }
  return where;
}

function construirePeriodeChamp(champ, dateDebut, dateFin) {
  const where = {};
  if (dateDebut || dateFin) {
    where[champ] = {};
    if (dateDebut) where[champ].gte = debutJournee(dateDebut);
    if (dateFin) where[champ].lte = finJournee(dateFin);
  }
  return where;
}

// Un caissier (non-ADMIN) ne peut consulter que la journée en cours dans États, quels
// que soient les paramètres envoyés — imposé ici côté serveur, pas juste caché à l'écran.
function restreindreAJourdhui(req, dateDebut, dateFin) {
  if (req.user.role === 'ADMIN') return { dateDebut, dateFin };
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return { dateDebut: aujourdhui, dateFin: aujourdhui };
}

// GET /api/etats/marge-produits?dateDebut=&dateFin=
async function margeParProduit(req, res) {
  const { dateDebut, dateFin } = req.query;

  const lignes = await prisma.ligneVente.findMany({
    where: { vente: { statut: 'VALIDEE', ...construirePeriode(dateDebut, dateFin) } },
    include: { article: true },
  });

  const parArticle = {};
  for (const l of lignes) {
    const key = l.articleId;
    if (!parArticle[key]) {
      parArticle[key] = {
        articleId: l.articleId,
        designation: l.article.designation,
        quantiteVendue: 0,
        chiffreAffaires: 0,
        coutTotal: 0,
      };
    }
    const montantLigne = Number(l.prixUnitaire) * l.quantite - Number(l.remiseLigne);
    const coutLigne = Number(l.article.prixAchat) * l.quantite;
    parArticle[key].quantiteVendue += l.quantite;
    parArticle[key].chiffreAffaires += montantLigne;
    parArticle[key].coutTotal += coutLigne;
  }

  const resultats = Object.values(parArticle).map((a) => ({
    ...a,
    marge: a.chiffreAffaires - a.coutTotal,
    tauxMarge: a.chiffreAffaires > 0 ? ((a.chiffreAffaires - a.coutTotal) / a.chiffreAffaires) * 100 : 0,
  }));

  resultats.sort((a, b) => b.marge - a.marge);

  res.json({ periode: { dateDebut: dateDebut || null, dateFin: dateFin || null }, resultats });
}

// GET /api/etats/recap-boutique?dateDebut=&dateFin=&lieuId=
async function recapBoutique(req, res) {
  const { dateDebut, dateFin, lieuId } = req.query;

  const where = { statut: 'VALIDEE', ...construirePeriode(dateDebut, dateFin) };
  if (lieuId) where.lieuId = Number(lieuId);

  const ventes = await prisma.vente.findMany({ where });
  const depenses = await prisma.depense.findMany({
    where: construirePeriodeChamp('dateDepense', dateDebut, dateFin),
  });
  const whereCyclesRecap = { ...construirePeriodeChamp('dateActivation', dateDebut, dateFin) };
  if (lieuId) whereCyclesRecap.lieuId = Number(lieuId);
  const cyclesCartesCadeaux = await prisma.carteCadeauCycle.findMany({ where: whereCyclesRecap });

  const totalVentes = ventes.reduce((s, v) => s + Number(v.totalNet), 0);
  const totalRemises = ventes.reduce((s, v) => s + Number(v.remiseMontant), 0);
  const totalDepenses = depenses.reduce((s, d) => s + Number(d.montant), 0);
  const totalCartesCadeaux = cyclesCartesCadeaux.reduce((s, c) => s + Number(c.denomination), 0);

  res.json({
    periode: { dateDebut: dateDebut || null, dateFin: dateFin || null },
    nombreVentes: ventes.length,
    totalVentes,
    totalRemises,
    totalDepenses,
    totalCartesCadeaux,
    resultatNet: totalVentes + totalCartesCadeaux - totalDepenses,
  });
}

// GET /api/etats/meilleur-vendeur?dateDebut=&dateFin=&lieuId=
async function meilleurVendeur(req, res) {
  const { dateDebut, dateFin: dateFinBrute, lieuId } = req.query;
  const periode = restreindreAJourdhui(req, dateDebut, dateFinBrute);

  const where = { statut: 'VALIDEE', vendeurId: { not: null }, ...construirePeriode(periode.dateDebut, periode.dateFin) };
  if (lieuId) where.lieuId = Number(lieuId);

  const ventes = await prisma.vente.findMany({
    where,
    include: { vendeur: true },
  });

  const parVendeur = {};
  for (const v of ventes) {
    const key = v.vendeurId;
    if (!parVendeur[key]) {
      parVendeur[key] = {
        vendeurId: key,
        nom: v.vendeur ? v.vendeur.nomComplet : 'Inconnu',
        nombreVentes: 0,
        chiffreAffaires: 0,
      };
    }
    parVendeur[key].nombreVentes += 1;
    parVendeur[key].chiffreAffaires += Number(v.totalNet);
  }

  const resultats = Object.values(parVendeur).sort((a, b) => b.nombreVentes - a.nombreVentes);

  res.json({ periode, resultats });
}

// GET /api/etats/par-date?dateDebut=&dateFin=&lieuId=
async function parDate(req, res) {
  const { dateDebut, dateFin: dateFinBrute, lieuId } = req.query;
  const periode = restreindreAJourdhui(req, dateDebut, dateFinBrute);
  const where = { statut: 'VALIDEE', ...construirePeriode(periode.dateDebut, periode.dateFin) };
  if (lieuId) where.lieuId = Number(lieuId);

  const ventes = await prisma.vente.findMany({
    where,
    include: { client: true, vendeur: true, lieu: true },
    orderBy: { createdAt: 'desc' },
  });
  const total = ventes.reduce((s, v) => s + Number(v.totalNet), 0);

  res.json({
    periode,
    nombreVentes: ventes.length,
    total,
    ventes,
  });
}

// GET /api/etats/par-mode-paiement?dateDebut=&dateFin=&lieuId=
async function parModePaiement(req, res) {
  const { dateDebut, dateFin: dateFinBrute, lieuId } = req.query;
  const periode = restreindreAJourdhui(req, dateDebut, dateFinBrute);
  const whereVente = { statut: 'VALIDEE', ...construirePeriode(periode.dateDebut, periode.dateFin) };
  if (lieuId) whereVente.lieuId = Number(lieuId);

  const paiements = await prisma.paiementVente.findMany({
    where: { vente: whereVente },
  });

  const whereCycles = { ...construirePeriodeChamp('dateActivation', periode.dateDebut, periode.dateFin) };
  if (lieuId) whereCycles.lieuId = Number(lieuId);
  const cyclesCartesCadeaux = await prisma.carteCadeauCycle.findMany({ where: whereCycles });

  const parMode = {};
  for (const p of paiements) {
    parMode[p.mode] = (parMode[p.mode] || 0) + Number(p.montant);
  }
  for (const c of cyclesCartesCadeaux) {
    if (!c.modePaiement) continue; // anciens cycles créés avant ce suivi, sans mode connu
    parMode[c.modePaiement] = (parMode[c.modePaiement] || 0) + Number(c.denomination);
  }

  const resultats = Object.entries(parMode)
    .map(([mode, montant]) => ({ mode, montant }))
    .sort((a, b) => b.montant - a.montant);
  const total = resultats.reduce((s, r) => s + r.montant, 0);

  res.json({ periode, total, resultats });
}

// GET /api/etats/par-type?dateDebut=&dateFin=&lieuId=
async function parType(req, res) {
  const { dateDebut, dateFin: dateFinBrute, lieuId } = req.query;
  const periode = restreindreAJourdhui(req, dateDebut, dateFinBrute);
  const where = { statut: 'VALIDEE', ...construirePeriode(periode.dateDebut, periode.dateFin) };
  if (lieuId) where.lieuId = Number(lieuId);

  const ventes = await prisma.vente.findMany({ where });
  const comptant = ventes.filter((v) => v.typeVente === 'COMPTANT');
  const credit = ventes.filter((v) => v.typeVente === 'CREDIT');
  const somme = (arr) => arr.reduce((s, v) => s + Number(v.totalNet), 0);

  res.json({
    periode,
    comptant: { nombre: comptant.length, total: somme(comptant) },
    credit: { nombre: credit.length, total: somme(credit) },
  });
}

// GET /api/etats/fermeture-caisse?date=&lieuId=
// Photo de la journée : encaissements (ventes du jour + règlements crédit reçus le jour même),
// dépenses du jour, résultat net, et mouvement des avoirs (émis / utilisés) — sans retour d'espèces.
async function fermetureCaisse(req, res) {
  const { date, lieuId } = req.query;
  const dateEffective = req.user.role === 'ADMIN' ? date : null;
  const jour = dateEffective ? new Date(dateEffective) : new Date();
  const debut = debutJournee(jour);
  const fin = finJournee(jour);

  const whereVente = { statut: 'VALIDEE', createdAt: { gte: debut, lte: fin } };
  if (lieuId) whereVente.lieuId = Number(lieuId);

  const ventes = await prisma.vente.findMany({ where: whereVente, include: { paiements: true } });

  const parMode = {};
  for (const v of ventes) {
    for (const p of v.paiements) {
      parMode[p.mode] = (parMode[p.mode] || 0) + Number(p.montant);
    }
  }

  const whereReglements = { createdAt: { gte: debut, lte: fin } };
  if (lieuId) whereReglements.vente = { lieuId: Number(lieuId) };
  const reglements = await prisma.reglementCredit.findMany({ where: whereReglements });
  for (const r of reglements) {
    parMode[r.mode] = (parMode[r.mode] || 0) + Number(r.montant);
  }

  const whereCyclesJour = { dateActivation: { gte: debut, lte: fin } };
  if (lieuId) whereCyclesJour.lieuId = Number(lieuId);
  const cyclesCartesCadeauxJour = await prisma.carteCadeauCycle.findMany({ where: whereCyclesJour });
  for (const c of cyclesCartesCadeauxJour) {
    if (!c.modePaiement) continue;
    parMode[c.modePaiement] = (parMode[c.modePaiement] || 0) + Number(c.denomination);
  }

  const totalEncaisse = Object.values(parMode).reduce((s, m) => s + m, 0);

  const avoirsEmis = await prisma.avoir.findMany({ where: { createdAt: { gte: debut, lte: fin } } });
  const avoirsUtilises = await prisma.avoir.findMany({ where: { dateUtilisation: { gte: debut, lte: fin } } });

  res.json({
    date: jour.toISOString().slice(0, 10),
    nombreVentes: ventes.length,
    parModePaiement: Object.entries(parMode).map(([mode, montant]) => ({ mode, montant })),
    totalEncaisse,
    avoirsEmis: { nombre: avoirsEmis.length, montant: avoirsEmis.reduce((s, a) => s + Number(a.montant), 0) },
    avoirsUtilises: { nombre: avoirsUtilises.length, montant: avoirsUtilises.reduce((s, a) => s + Number(a.montant), 0) },
  });
}

// GET /api/etats/marge-produits/export.csv?dateDebut=&dateFin=
async function exporterMargeCsv(req, res) {
  const { dateDebut, dateFin } = req.query;

  const lignes = await prisma.ligneVente.findMany({
    where: { vente: { statut: 'VALIDEE', ...construirePeriode(dateDebut, dateFin) } },
    include: { article: true },
  });

  const parArticle = {};
  for (const l of lignes) {
    const key = l.articleId;
    if (!parArticle[key]) {
      parArticle[key] = { designation: l.article.designation, quantiteVendue: 0, chiffreAffaires: 0, coutTotal: 0 };
    }
    const montantLigne = Number(l.prixUnitaire) * l.quantite - Number(l.remiseLigne);
    const coutLigne = Number(l.article.prixAchat) * l.quantite;
    parArticle[key].quantiteVendue += l.quantite;
    parArticle[key].chiffreAffaires += montantLigne;
    parArticle[key].coutTotal += coutLigne;
  }

  const lignesCsv = ['Désignation;Quantité vendue;Chiffre d\'affaires;Coût total;Marge;Taux de marge (%)'];
  for (const a of Object.values(parArticle)) {
    const marge = a.chiffreAffaires - a.coutTotal;
    const taux = a.chiffreAffaires > 0 ? (marge / a.chiffreAffaires) * 100 : 0;
    lignesCsv.push(
      `${a.designation};${a.quantiteVendue};${a.chiffreAffaires.toFixed(2)};${a.coutTotal.toFixed(2)};${marge.toFixed(2)};${taux.toFixed(1)}`
    );
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="marge-produits.csv"');
  res.send('\uFEFF' + lignesCsv.join('\n'));
}

// GET /api/etats/ventes/export.csv?dateDebut=&dateFin=&lieuId=
async function exporterVentesCsv(req, res) {
  const { dateDebut, dateFin, lieuId } = req.query;
  const where = { statut: 'VALIDEE', ...construirePeriode(dateDebut, dateFin) };
  if (lieuId) where.lieuId = Number(lieuId);

  const ventes = await prisma.vente.findMany({
    where,
    include: { client: true, vendeur: true, lieu: true, paiements: true },
    orderBy: { createdAt: 'asc' },
  });

  const lignesCsv = ['Date;Numéro;Boutique;Vendeur;Client;Type;Total HT;Remise;Total net;Modes de paiement'];
  for (const v of ventes) {
    const dateTexte = new Date(v.createdAt).toLocaleDateString('fr-FR');
    const modes = v.paiements.map((p) => p.mode).join(', ');
    lignesCsv.push(
      [
        dateTexte,
        v.numero,
        v.lieu?.nom || '',
        v.vendeur?.nomComplet || '',
        v.client?.nomComplet || '',
        v.typeVente === 'CREDIT' ? 'Crédit' : 'Comptant',
        Number(v.totalHT).toFixed(2),
        Number(v.remiseMontant).toFixed(2),
        Number(v.totalNet).toFixed(2),
        modes,
      ].join(';')
    );
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ventes.csv"');
  res.send('\uFEFF' + lignesCsv.join('\n'));
}

// GET /api/etats/depenses/export.csv?dateDebut=&dateFin=
async function exporterDepensesCsv(req, res) {
  const { dateDebut, dateFin } = req.query;

  const depenses = await prisma.depense.findMany({
    where: construirePeriodeChamp('dateDepense', dateDebut, dateFin),
    include: { categorie: true, utilisateur: true },
    orderBy: { dateDepense: 'asc' },
  });

  const lignesCsv = ['Date;Catégorie;Montant;Description;Saisie par'];
  for (const d of depenses) {
    const dateTexte = new Date(d.dateDepense).toLocaleDateString('fr-FR');
    lignesCsv.push(
      [
        dateTexte,
        d.categorie?.nom || '',
        Number(d.montant).toFixed(2),
        (d.description || '').replace(/;/g, ','),
        d.utilisateur?.nomComplet || '',
      ].join(';')
    );
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="depenses.csv"');
  res.send('\uFEFF' + lignesCsv.join('\n'));
}

module.exports = {
  margeParProduit, recapBoutique, meilleurVendeur,
  parDate, parModePaiement, parType, fermetureCaisse,
  exporterMargeCsv, exporterVentesCsv, exporterDepensesCsv,
};

