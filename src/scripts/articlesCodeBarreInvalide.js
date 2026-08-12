// Liste tous les articles dont le code-barre n'est PAS un EAN13 valide
// (exactement 13 chiffres) — ces articles faisaient planter l'impression
// d'étiquettes avant le correctif. Le correctif les imprime maintenant sans
// planter (juste sans le visuel code-barre), mais mieux vaut régénérer un
// code-barre propre pour chacun d'eux.
//
// Usage :
//   node src/scripts/articlesCodeBarreInvalide.js

require('dotenv').config();
const prisma = require('../lib/prisma');

async function main() {
  const articles = await prisma.article.findMany({
    where: { actif: true, codeBarre: { not: null } },
    orderBy: { designation: 'asc' },
  });

  const invalides = articles.filter((a) => !/^\d{13}$/.test(a.codeBarre));

  if (invalides.length === 0) {
    console.log('Aucun article avec un code-barre invalide — tout est propre.');
    return;
  }

  console.log(`${invalides.length} article(s) avec un code-barre non-EAN13 (à régénérer) :\n`);
  for (const a of invalides) {
    console.log(`  [${a.reference}] "${a.designation}" — code-barre actuel : "${a.codeBarre}"`);
  }
  console.log('\nCes codes-barres ne sont pas modifiables depuis l\'appli (champ non éditable une fois créé).');
  console.log('Utilise le script src/scripts/regenererCodeBarre.js pour en corriger un.');
}

main()
  .catch((err) => {
    console.error('Erreur :', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
