// Régénère en une seule fois le code-barre de TOUS les articles dont le
// code-barre actuel n'est pas un EAN13 valide (pas exactement 13 chiffres).
// Sur le même principe que les autres scripts : aperçu complet d'abord,
// rien n'est modifié tant que --confirm n'est pas ajouté.
//
// Usage :
//   node src/scripts/regenererTousLesCodesBarresInvalides.js              → aperçu seul
//   node src/scripts/regenererTousLesCodesBarresInvalides.js --confirm    → applique réellement

require('dotenv').config();
const prisma = require('../lib/prisma');
const { genererCodeBarreInterne } = require('../utils/barcode');

async function main() {
  const CONFIRME = process.argv.includes('--confirm');

  const articles = await prisma.article.findMany({
    where: { actif: true, codeBarre: { not: null } },
    orderBy: { designation: 'asc' },
  });

  const invalides = articles.filter((a) => !/^\d{13}$/.test(a.codeBarre));

  if (invalides.length === 0) {
    console.log('Aucun article avec un code-barre invalide — rien à faire.');
    return;
  }

  console.log(`${invalides.length} article(s) à corriger :\n`);
  const prevus = invalides.map((a) => ({
    article: a,
    ancien: a.codeBarre,
    nouveau: genererCodeBarreInterne(a.id),
  }));

  for (const p of prevus) {
    console.log(`  [${p.article.reference}] "${p.article.designation}" — "${p.ancien}" → "${p.nouveau}"`);
  }

  if (!CONFIRME) {
    console.log('\nAperçu seul — rien n\'a été modifié.');
    console.log('Relance avec --confirm pour appliquer réellement ces changements.');
    return;
  }

  console.log('\nApplication en cours...');
  for (const p of prevus) {
    await prisma.article.update({
      where: { id: p.article.id },
      data: { codeBarre: p.nouveau, codeBarreGenere: true },
    });
    console.log(`  [${p.article.reference}] corrigé.`);
  }
  console.log(`\n${prevus.length} article(s) corrigé(s) avec succès.`);
  console.log('Pense à réimprimer les étiquettes de ces articles avec leur nouveau code-barre.');
}

main()
  .catch((err) => {
    console.error('Erreur :', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
