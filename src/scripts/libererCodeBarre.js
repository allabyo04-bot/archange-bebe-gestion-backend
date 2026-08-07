// Vide le champ code-barre d'un article (généralement désactivé), pour
// libérer ce code-barre et permettre de l'utiliser sur un autre article.
// L'article visé reste inchangé par ailleurs (toujours désactivé si il
// l'était, stock intact, etc.) — seul son code-barre est retiré.
//
// Usage :
//   node src/scripts/libererCodeBarre.js KNF07              → aperçu seul
//   node src/scripts/libererCodeBarre.js KNF07 --confirm    → applique réellement

require('dotenv').config();
const prisma = require('../lib/prisma');

async function main() {
  const reference = process.argv[2];
  const CONFIRME = process.argv.includes('--confirm');

  if (!reference) {
    console.log('Usage : node src/scripts/libererCodeBarre.js <reference> [--confirm]');
    return;
  }

  const article = await prisma.article.findUnique({ where: { reference } });
  if (!article) {
    console.log(`Aucun article avec la référence "${reference}".`);
    return;
  }
  if (!article.codeBarre) {
    console.log(`[${article.reference}] "${article.designation}" n'a déjà aucun code-barre.`);
    return;
  }

  console.log(`[${article.reference}] "${article.designation}" — actif: ${article.actif ? 'oui' : 'non'} — code-barre actuel : ${article.codeBarre}`);

  if (!CONFIRME) {
    console.log('\nAperçu seul — rien n\'a été modifié.');
    console.log('Relance avec --confirm pour libérer réellement ce code-barre.');
    return;
  }

  await prisma.article.update({
    where: { id: article.id },
    data: { codeBarre: null, codeBarreGenere: false },
  });
  console.log(`\nCode-barre retiré de [${article.reference}]. Il est maintenant réutilisable ailleurs.`);
}

main()
  .catch((err) => {
    console.error('Erreur :', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
