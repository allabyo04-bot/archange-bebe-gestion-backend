// Remplace le code-barre d'un article (généralement invalide, hérité d'un
// import) par un nouveau code-barre EAN13 interne correctement formaté.
//
// Usage :
//   node src/scripts/regenererCodeBarre.js <reference>              → aperçu seul
//   node src/scripts/regenererCodeBarre.js <reference> --confirm    → applique réellement

require('dotenv').config();
const prisma = require('../lib/prisma');
const { genererCodeBarreInterne } = require('../utils/barcode');

async function main() {
  const reference = process.argv[2];
  const CONFIRME = process.argv.includes('--confirm');

  if (!reference) {
    console.log('Usage : node src/scripts/regenererCodeBarre.js <reference> [--confirm]');
    return;
  }

  const article = await prisma.article.findUnique({ where: { reference } });
  if (!article) {
    console.log(`Aucun article avec la référence "${reference}".`);
    return;
  }

  const nouveauCodeBarre = genererCodeBarreInterne(article.id);
  console.log(`[${article.reference}] "${article.designation}"`);
  console.log(`  Code-barre actuel : ${article.codeBarre || '(aucun)'}`);
  console.log(`  Nouveau code-barre : ${nouveauCodeBarre}`);

  if (!CONFIRME) {
    console.log('\nAperçu seul — rien n\'a été modifié.');
    console.log('Relance avec --confirm pour appliquer réellement ce changement.');
    return;
  }

  await prisma.article.update({
    where: { id: article.id },
    data: { codeBarre: nouveauCodeBarre, codeBarreGenere: true },
  });
  console.log('\nCode-barre remplacé avec succès.');
}

main()
  .catch((err) => {
    console.error('Erreur :', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
