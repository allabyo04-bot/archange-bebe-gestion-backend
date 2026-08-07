// Applique le comptage physique réel de la BOUTIQUE PRINCIPALE sur une liste
// fermée de références (issues du tableau fourni par l'utilisateur après
// inventaire manuel). Pour chaque référence :
//   - si l'article existe encore en base (actif ou désactivé) : il est
//     réactivé, et son stock à Boutique Principale est ajusté pour
//     correspondre EXACTEMENT à la quantité comptée (pas un ajout — un
//     remplacement, comme un inventaire).
//   - si l'article a été supprimé définitivement : impossible à traiter ici,
//     il est listé à part pour recréation manuelle.
//
// Les autres boutiques/entrepôts ne sont jamais touchés par ce script.
//
// Usage :
//   node src/scripts/appliquerComptagePrincipale.js              → aperçu seul
//   node src/scripts/appliquerComptagePrincipale.js --confirm    → applique réellement

require('dotenv').config();
const prisma = require('../lib/prisma');
const { appliquerMouvementStock } = require('../lib/stock');

const CONFIRME = process.argv.includes('--confirm');
const NOM_BOUTIQUE = 'Boutique Principale';

// Comptage fourni par l'utilisateur (référence -> quantité). Les doublons de
// référence dans le tableau d'origine (ex: KNG08 apparu 2 fois) sont
// additionnés automatiquement ci-dessous.
const LIGNES_BRUTES = [
  ['KNG26', 3], ['KNF13', 10], ['KNG21', 1], ['KNG19', 3], ['KNF11', 4],
  ['KNG11', 15], ['KNF08', 2], ['KNG05', 1], ['KNG04', 1], ['KNG01', 14],
  ['KNF00', 12], ['KNF07', 45], ['KNF19', 30], ['KNG08', 7], ['KNG15', 3],
  ['KNF09', 3], ['KNG17', 1], ['KNG16', 1], ['EGA10', 12],
];

function fusionnerDoublons(lignes) {
  const parReference = new Map();
  for (const [ref, qte] of lignes) {
    parReference.set(ref, (parReference.get(ref) || 0) + qte);
  }
  return [...parReference.entries()];
}

async function main() {
  const comptage = fusionnerDoublons(LIGNES_BRUTES);

  const doublons = LIGNES_BRUTES
    .map((l) => l[0])
    .filter((ref, i, arr) => arr.indexOf(ref) !== i);
  if (doublons.length > 0) {
    console.log(`⚠️ Référence(s) apparue(s) plusieurs fois dans le tableau, quantités additionnées : ${[...new Set(doublons)].join(', ')}\n`);
  }

  const boutique = await prisma.lieu.findUnique({ where: { nom: NOM_BOUTIQUE } });
  if (!boutique) {
    console.log(`Lieu "${NOM_BOUTIQUE}" introuvable — vérifie le nom exact.`);
    return;
  }

  const admin = await prisma.utilisateur.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    console.log('Aucun utilisateur ADMIN trouvé en base — impossible de tracer le mouvement de stock.');
    return;
  }

  console.log(`Cible : ${NOM_BOUTIQUE} (id ${boutique.id})\n`);

  const traitables = [];
  const introuvables = [];

  for (const [reference, quantiteCible] of comptage) {
    const article = await prisma.article.findUnique({
      where: { reference },
      include: { stocksEmplacement: { where: { lieuId: boutique.id } } },
    });
    if (!article) {
      introuvables.push({ reference, quantiteCible });
      continue;
    }
    const stockActuelBoutique = article.stocksEmplacement[0]?.quantite ?? 0;
    const delta = quantiteCible - stockActuelBoutique;
    traitables.push({ article, quantiteCible, stockActuelBoutique, delta });
  }

  console.log(`${traitables.length} référence(s) trouvée(s) et traitable(s) :\n`);
  for (const t of traitables) {
    const signe = t.delta > 0 ? '+' : '';
    console.log(
      `  [${t.article.reference}] "${t.article.designation}" — actif: ${t.article.actif ? 'oui' : 'NON (sera réactivé)'} `
      + `— stock actuel Boutique Principale: ${t.stockActuelBoutique} → ${t.quantiteCible} (${signe}${t.delta})`
    );
  }

  if (introuvables.length > 0) {
    console.log(`\n⚠️ ${introuvables.length} référence(s) INTROUVABLE(S) en base (probablement supprimée(s) définitivement) — à recréer manuellement :`);
    for (const i of introuvables) {
      console.log(`  [${i.reference}] quantité comptée : ${i.quantiteCible} — ARTICLE À RECRÉER`);
    }
  }

  if (!CONFIRME) {
    console.log('\nAperçu seul — rien n\'a été modifié.');
    console.log('Relance avec --confirm pour appliquer réellement ces changements.');
    return;
  }

  console.log('\nApplication en cours...');
  for (const t of traitables) {
    await prisma.$transaction(async (tx) => {
      if (!t.article.actif) {
        await tx.article.update({ where: { id: t.article.id }, data: { actif: true } });
      }
      if (t.delta !== 0) {
        await appliquerMouvementStock(tx, {
          articleId: t.article.id,
          lieuId: boutique.id,
          delta: t.delta,
          type: 'CORRECTION_INVENTAIRE',
          utilisateurId: admin.id,
          notes: 'Comptage physique Boutique Principale (script appliquerComptagePrincipale)',
        });
      }
    });
    console.log(`  [${t.article.reference}] traité — stock réglé à ${t.quantiteCible}.`);
  }
  console.log(`\n${traitables.length} référence(s) mise(s) à jour avec succès.`);
  if (introuvables.length > 0) {
    console.log(`${introuvables.length} référence(s) restent à recréer manuellement (voir liste ci-dessus).`);
  }
}

main()
  .catch((err) => {
    console.error('Erreur :', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
