// Import du catalogue Abigescom -> Archange Bébé
//
// Usage :
//   node src/scripts/importAbigescomCatalogue.js                → aperçu seul, ne touche PAS la base
//   node src/scripts/importAbigescomCatalogue.js --confirm       → exécute réellement l'import
//
// Fichiers attendus dans le dossier ./import-data/ (à la racine du backend) :
//   - Articles__Code__code_barre__famille_et_sous_famille.xlsx
//   - Stocks_Boutique_Principale.xls
//   - Stock_boutique_secondaire.xls

require('dotenv').config();
const path = require('path');
const XLSX = require('xlsx');
const prisma = require('../lib/prisma');

const DOSSIER = path.join(__dirname, '../../import-data');
const FICHIER_ARTICLES = path.join(DOSSIER, 'Articles__Code__code_barre__famille_et_sous_famille.xlsx');
const FICHIER_STOCK_PRINCIPALE = path.join(DOSSIER, 'Stocks_Boutique_Principale.xls');
const FICHIER_STOCK_SECONDAIRE = path.join(DOSSIER, 'Stock_boutique_secondaire.xls');

const CONFIRME = process.argv.includes('--confirm');

const DESIGNATIONS_EXCLUES = ["TEST D'IMPRESSION", 'ARTICLE ESSAI'];

// Résolution manuelle des collisions de préfixe de sous-famille (validées avec l'utilisateur).
// Clé = "Famille|Sous-Famille" (après trim), valeur = préfixe forcé pour les futurs articles.
const PREFIXES_FORCES = {
  'ACCESSOIRES|MOUSTIQUAIRE': 'MOUA',
  'LITERIE|MOUSTIQUAIRE': 'MOU',
  'ACCESSOIRES|SAC': 'SACA',
  'SAC|SAC': 'SAC',
  'ACCESSOIRES|SERVIETTE': 'SERA',
  'SERVIETTE|SERVIETTE': 'SER',
  "COTON|COTON TIGE": 'COT',
  'SUCRERIE|CHOCOLAT': 'CHOC',
  'PUERICULTURE|ANNEAU DENTAIRE': 'BADD',
  'PUERICULTURE|BROSSE A DENT': 'BAD',
};

function nettoie(v) {
  return (v === null || v === undefined) ? '' : String(v).trim();
}

function splitCode(code) {
  const m = /^([A-Za-zÀ-ÿ']+)(\d+)$/.exec(code.trim());
  if (!m) return null;
  return { prefixe: m[1], numero: parseInt(m[2], 10) };
}

function formatBarreCode(valeur) {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const n = Math.round(Number(valeur));
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(n);
}

function lireLignes(fichier) {
  const classeur = XLSX.readFile(fichier, { cellDates: false });
  const feuille = classeur.Sheets[classeur.SheetNames[0]];
  return XLSX.utils.sheet_to_json(feuille, { defval: null });
}

function construirePlan() {
  const lignesBrutes = lireLignes(FICHIER_ARTICLES);

  const articles = [];
  const exclus = [];
  const erreursFormat = [];

  for (const l of lignesBrutes) {
    const code = nettoie(l['Code']);
    const designation = nettoie(l["Désignation de l'article"]);
    if (!code) continue;

    if (DESIGNATIONS_EXCLUES.some((d) => designation.toUpperCase() === d.toUpperCase())) {
      exclus.push({ code, designation });
      continue;
    }

    const famille = nettoie(l['Famille']);
    const sousFamille = nettoie(l['Sous-Famille']);
    const prixAchat = Number(l["Prix d'achat"]) || 0;
    const prixVenteBrut = l['Prix de vente'];
    const prixVente = (prixVenteBrut === null || prixVenteBrut === undefined || Number(prixVenteBrut) === 0)
      ? 0
      : Number(prixVenteBrut);
    const codeBarre = formatBarreCode(l['Code Barre']);

    articles.push({ code, designation, famille, sousFamille, prixAchat, prixVente, codeBarre });
  }

  // --- Groupes famille/sous-famille + préfixe ---
  // (les articles sans sous-famille renseignée gardent sousFamille === '' et ne
  // participent à aucun groupe — ils seront importés avec sousFamilleId = null)
  const groupes = new Map(); // clé "Famille|SousFamille" -> { famille, sousFamille, articles: [] }
  for (const a of articles) {
    if (!a.sousFamille) continue;
    const cle = `${a.famille}|${a.sousFamille}`;
    if (!groupes.has(cle)) groupes.set(cle, { famille: a.famille, sousFamille: a.sousFamille, articles: [] });
    groupes.get(cle).articles.push(a);
  }

  const plansSousFamille = [];
  for (const [cle, g] of groupes) {
    // fréquence des préfixes détectés dans le groupe
    const freq = new Map();
    for (const a of g.articles) {
      const s = splitCode(a.code);
      if (!s) continue;
      freq.set(s.prefixe, (freq.get(s.prefixe) || 0) + 1);
    }
    let prefixeDominant = null, meilleurCompte = -1;
    for (const [p, c] of freq) {
      if (c > meilleurCompte) { prefixeDominant = p; meilleurCompte = c; }
    }

    const prefixeFinal = PREFIXES_FORCES[cle] || prefixeDominant || cle.replace(/[^A-Z]/gi, '').slice(0, 4).toUpperCase();

    // dernierNumero = plus haut numéro parmi les codes qui matchent EXACTEMENT ce préfixe
    let dernierNumero = 0;
    for (const a of g.articles) {
      const s = splitCode(a.code);
      if (s && s.prefixe === prefixeDominant) dernierNumero = Math.max(dernierNumero, s.numero);
    }

    plansSousFamille.push({
      cle, famille: g.famille, sousFamille: g.sousFamille,
      prefixeFinal, dernierNumero, nombreArticles: g.articles.length,
    });
  }

  // --- Doublons de code-barres ---
  const parBarre = new Map();
  for (const a of articles) {
    if (!a.codeBarre) continue;
    if (!parBarre.has(a.codeBarre)) parBarre.set(a.codeBarre, []);
    parBarre.get(a.codeBarre).push(a);
  }
  for (const [barre, liste] of parBarre) {
    if (liste.length > 1) {
      // le premier garde le code-barres, les suivants repartent sans
      for (let i = 1; i < liste.length; i++) liste[i].codeBarre = null;
    }
  }

  // --- Stock par boutique ---
  const stockPrincipale = lireLignes(FICHIER_STOCK_PRINCIPALE)
    .filter((l) => nettoie(l['Code article']))
    .map((l) => ({ code: nettoie(l['Code article']), quantite: Number(l['Stock Théo.']) || 0 }));
  const stockSecondaire = lireLignes(FICHIER_STOCK_SECONDAIRE)
    .filter((l) => nettoie(l['Code article']))
    .map((l) => ({ code: nettoie(l['Code article']), quantite: Number(l['Stock Théo.']) || 0 }));

  return { articles, exclus, erreursFormat, plansSousFamille, stockPrincipale, stockSecondaire };
}

async function afficherApercu(plan) {
  console.log('='.repeat(70));
  console.log('APERÇU IMPORT CATALOGUE ABIGESCOM (aucune écriture en base)');
  console.log('='.repeat(70));
  console.log(`Articles à importer : ${plan.articles.length}`);
  console.log(`Articles exclus (test) : ${plan.exclus.length} ->`, plan.exclus.map((e) => e.code).join(', '));
  console.log(`Groupes famille/sous-famille : ${plan.plansSousFamille.length}`);
  console.log(`Stock Boutique Principale : ${plan.stockPrincipale.length} lignes`);
  console.log(`Stock Boutique Secondaire : ${plan.stockSecondaire.length} lignes`);
  const sansPrix = plan.articles.filter((a) => a.prixVente === 0);
  console.log(`Articles sans prix de vente (importés à 0 F) : ${sansPrix.length} ->`, sansPrix.map((a) => a.code).join(', '));
  const barresRetires = plan.articles.filter((a) => a._barreRetire);
  const sansSousFamille = plan.articles.filter((a) => !a.sousFamille);
  console.log(`Articles sans sous-famille (importés avec sousFamilleId=null) : ${sansSousFamille.length} ->`, sansSousFamille.map((a) => a.code).join(', '));
  console.log('\nExemple de plan sous-famille (10 premiers) :');
  for (const p of plan.plansSousFamille.slice(0, 10)) {
    console.log(`  ${p.cle} -> préfixe "${p.prefixeFinal}", dernierNumero=${p.dernierNumero}, ${p.nombreArticles} article(s)`);
  }
  console.log('\nRelance avec --confirm pour exécuter réellement l\'import.');
}

async function executerImport(plan) {
  console.log('Exécution de l\'import (écritures en base)...');

  const boutiquePrincipale = await prisma.lieu.findUnique({ where: { nom: 'Boutique Principale' } });
  const boutiqueSecondaire = await prisma.lieu.findUnique({ where: { nom: 'Boutique Secondaire' } });
  if (!boutiquePrincipale || !boutiqueSecondaire) {
    throw new Error('Boutique Principale / Boutique Secondaire introuvables. Le seed initial a-t-il été exécuté ?');
  }
  const admin = await prisma.utilisateur.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) throw new Error('Aucun utilisateur ADMIN trouvé pour tracer les mouvements de stock.');

  // 1) Familles
  const familleParNom = new Map();
  const nomsFamilles = [...new Set(plan.articles.map((a) => a.famille))];
  for (const nom of nomsFamilles) {
    const f = await prisma.famille.upsert({ where: { nom }, update: {}, create: { nom } });
    familleParNom.set(nom, f);
  }
  console.log(`Familles : ${familleParNom.size} prêtes.`);

  // 2) Sous-familles (par groupe famille+sous-famille, avec préfixe calculé)
  const sousFamilleParCle = new Map();
  for (const p of plan.plansSousFamille) {
    const famille = familleParNom.get(p.famille);
    const sf = await prisma.sousFamille.upsert({
      where: { familleId_nom: { familleId: famille.id, nom: p.sousFamille } },
      update: { codePrefixe: p.prefixeFinal, dernierNumero: p.dernierNumero },
      create: {
        nom: p.sousFamille, familleId: famille.id,
        codePrefixe: p.prefixeFinal, dernierNumero: p.dernierNumero,
      },
    });
    sousFamilleParCle.set(p.cle, sf);
  }
  console.log(`Sous-familles : ${sousFamilleParCle.size} prêtes.`);

  // 3) Articles
  const articleParCode = new Map();
  let creees = 0, mises_a_jour = 0;
  for (const a of plan.articles) {
    const famille = familleParNom.get(a.famille);
    const sousFamille = a.sousFamille ? sousFamilleParCle.get(`${a.famille}|${a.sousFamille}`) : null;
    const existant = await prisma.article.findUnique({ where: { reference: a.code } });
    const data = {
      designation: a.designation,
      familleId: famille.id,
      sousFamilleId: sousFamille ? sousFamille.id : null,
      prixAchat: a.prixAchat,
      prixVente: a.prixVente,
      codeBarre: a.codeBarre || null,
    };
    if (existant) {
      const article = await prisma.article.update({ where: { id: existant.id }, data });
      articleParCode.set(a.code, article);
      mises_a_jour++;
    } else {
      const article = await prisma.article.create({ data: { reference: a.code, ...data } });
      articleParCode.set(a.code, article);
      creees++;
    }
  }
  console.log(`Articles : ${creees} créés, ${mises_a_jour} déjà existants (mis à jour).`);

  // 4) Stock initial (StockEmplacement, en valeur absolue — idempotent en cas de relance)
  //    Pas de transaction par ligne : sur connexion lente/instable, ouvrir une transaction
  //    par ligne peut expirer (P2028). On fait des upserts simples, avec quelques tentatives
  //    en cas de coupure réseau ponctuelle.
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

  async function importerStock(lignes, lieu, libelleLieu) {
    let ok = 0, introuvables = 0, ignores = 0;
    for (const l of lignes) {
      const article = articleParCode.get(l.code);
      if (!article) { introuvables++; continue; }
      if (l.quantite === 0) { ignores++; continue; }
      await avecReessai(() => prisma.stockEmplacement.upsert({
        where: { articleId_lieuId: { articleId: article.id, lieuId: lieu.id } },
        update: { quantite: l.quantite },
        create: { articleId: article.id, lieuId: lieu.id, quantite: l.quantite },
      }));
      ok++;
    }
    console.log(`Stock ${libelleLieu} : ${ok} ligne(s) appliquée(s), ${ignores} à 0 ignorée(s), ${introuvables} code(s) introuvable(s).`);
  }
  await importerStock(plan.stockPrincipale, boutiquePrincipale, 'Boutique Principale');
  await importerStock(plan.stockSecondaire, boutiqueSecondaire, 'Boutique Secondaire');

  // 5) Recalcule Article.stockActuel = somme de ses StockEmplacement (toutes boutiques),
  //    en une seule passe finale — évite tout souci d'incrément en double sur relance.
  console.log('Recalcul du stock total par article...');
  const sommes = await prisma.stockEmplacement.groupBy({ by: ['articleId'], _sum: { quantite: true } });
  let miseAJourStockActuel = 0;
  for (const s of sommes) {
    await avecReessai(() => prisma.article.update({
      where: { id: s.articleId },
      data: { stockActuel: s._sum.quantite || 0 },
    }));
    miseAJourStockActuel++;
  }
  console.log(`Stock total recalculé pour ${miseAJourStockActuel} article(s).`);

  console.log('\nImport catalogue terminé avec succès.');
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
  .finally(() => prisma.$disconnect());
