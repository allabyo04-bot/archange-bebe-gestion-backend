// Import des ventes de Juillet 2026 déjà enregistrées dans Abigescom (fichier des
// règlements) comme ventes historiques dans Archange Bébé, pour qu'elles apparaissent
// jour par jour dans États → Par date.
//
// Ne recrée PAS de mouvement de stock : le stock importé par importAbigescomCatalogue.js
// reflète déjà l'état actuel (donc après ces ventes). Ce script est purement pour
// la continuité des rapports de ventes/encaissements.
//
// Usage :
//   node src/scripts/importAbigescomVentesJuillet.js              → aperçu seul
//   node src/scripts/importAbigescomVentesJuillet.js --confirm    → exécute réellement

require('dotenv').config();
const path = require('path');
const XLSX = require('xlsx');
const prisma = require('../lib/prisma');

const DOSSIER = path.join(__dirname, '../../import-data');
const FICHIER = path.join(DOSSIER, 'REGLEMENTS_JUILLET_2026.xls');

const CONFIRME = process.argv.includes('--confirm');
const NOM_LIEU = 'Boutique Principale';

// Convertit un numéro de série Excel (jours depuis 1899-12-30) en Date UTC, fixée à
// midi ce jour-là. On ignore volontairement la colonne "Heure" : sa conversion en
// heures/minutes via la librairie xlsx s'est révélée incohérente d'une machine à
// l'autre (écart constaté de plusieurs dizaines de minutes entre Linux et Windows).
// Seul le jour calendaire compte ici (ventes consultées "par jour"), et le calcul
// manuel ci-dessous ne dépend d'aucune conversion de date interne à la librairie.
function serialExcelVersDate(serial) {
  const jour = Math.floor(Number(serial));
  const msEpoch = (jour - 25569) * 86400 * 1000; // 25569 = numéro de série du 1er janvier 1970
  return new Date(msEpoch + 12 * 3600 * 1000); // midi UTC ce jour-là
}

function construirePlan() {
  const classeur = XLSX.readFile(FICHIER, { cellDates: false });
  const feuille = classeur.Sheets[classeur.SheetNames[0]];
  const lignesBrutes = XLSX.utils.sheet_to_json(feuille, { defval: null });

  const ventes = [];
  const ignorees = { vides: 0, montantZero: 0 };
  const numerosVus = new Map(); // base -> nombre d'occurrences déjà attribuées

  for (const l of lignesBrutes) {
    const npiece = l['N° pièce'];
    const dateBrute = l['DATE'];
    if (!npiece || !dateBrute) { ignorees.vides++; continue; }

    const montant = Number(l['Montant']) || 0;
    if (montant === 0) { ignorees.montantZero++; continue; }

    const dateHeure = serialExcelVersDate(dateBrute);

    // Une même pièce peut être réglée en plusieurs fois / plusieurs modes (même N° pièce
    // et parfois même N° Règlt) — on désambiguïse avec un suffixe pour ne perdre aucun
    // règlement.
    const base = `IMPORT-${String(npiece).trim()}`;
    const occurrence = numerosVus.get(base) || 0;
    numerosVus.set(base, occurrence + 1);
    const numero = occurrence === 0 ? base : `${base}-${occurrence + 1}`;

    ventes.push({
      numero,
      montant,
      modePaiement: String(l['Mode paiement'] || 'Espèces').trim(),
      dateHeure,
    });
  }

  return { ventes, ignorees };
}

async function afficherApercu(plan) {
  console.log('='.repeat(70));
  console.log('APERÇU IMPORT VENTES JUILLET 2026 (aucune écriture en base)');
  console.log('='.repeat(70));
  console.log(`Ventes à importer : ${plan.ventes.length}`);
  console.log(`Lignes ignorées (vides) : ${plan.ignorees.vides}`);
  console.log(`Lignes ignorées (montant à 0 F) : ${plan.ignorees.montantZero}`);
  const total = plan.ventes.reduce((s, v) => s + v.montant, 0);
  console.log(`Total cumulé : ${total.toLocaleString('fr-FR')} F`);
  console.log(`Boutique : ${NOM_LIEU} (toutes les ventes)`);
  console.log('\nPar mode de paiement :');
  const parMode = {};
  for (const v of plan.ventes) parMode[v.modePaiement] = (parMode[v.modePaiement] || 0) + v.montant;
  for (const [mode, montant] of Object.entries(parMode)) {
    console.log(`  ${mode} : ${montant.toLocaleString('fr-FR')} F`);
  }
  console.log('\nExemple (5 premières) :');
  for (const v of plan.ventes.slice(0, 5)) {
    console.log(`  ${v.numero} — ${v.dateHeure.toISOString()} — ${v.montant.toLocaleString('fr-FR')} F — ${v.modePaiement}`);
  }
  console.log('\nRelance avec --confirm pour exécuter réellement l\'import.');
}

async function executerImport(plan) {
  console.log('Exécution de l\'import (écritures en base)...');

  const lieu = await prisma.lieu.findUnique({ where: { nom: NOM_LIEU } });
  if (!lieu) throw new Error(`Lieu "${NOM_LIEU}" introuvable.`);
  const admin = await prisma.utilisateur.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) throw new Error('Aucun utilisateur ADMIN trouvé.');

  async function avecReessai(fn, tentatives = 4) {
    for (let i = 1; i <= tentatives; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === tentatives) throw err;
        console.log(`  (coupure réseau, nouvelle tentative ${i + 1}/${tentatives}...)`);
        await new Promise((r) => setTimeout(r, 2000 * i));
      }
    }
  }

  let creees = 0, dejaExistantes = 0;
  for (const v of plan.ventes) {
    const existante = await avecReessai(() => prisma.vente.findUnique({ where: { numero: v.numero } }));
    if (existante) { dejaExistantes++; continue; }

    const vente = await avecReessai(() => prisma.vente.create({
      data: {
        numero: v.numero,
        utilisateurId: admin.id,
        lieuId: lieu.id,
        statut: 'VALIDEE',
        typeVente: 'COMPTANT',
        totalHT: v.montant,
        remiseMontant: 0,
        totalNet: v.montant,
        modePaiement: v.modePaiement,
        createdAt: v.dateHeure,
      },
    }));
    await avecReessai(() => prisma.paiementVente.create({
      data: { venteId: vente.id, mode: v.modePaiement, montant: v.montant, createdAt: v.dateHeure },
    }));
    creees++;
  }

  console.log(`\nTerminé : ${creees} vente(s) créée(s), ${dejaExistantes} déjà présente(s) (relance sans effet).`);
}

async function main() {
  const plan = construirePlan();
  if (!CONFIRME) {
    await afficherApercu(plan);
  } else {
    await executerImport(plan);
  }
}

main()
  .catch((e) => { console.error('ERREUR :', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect && prisma.$disconnect());
