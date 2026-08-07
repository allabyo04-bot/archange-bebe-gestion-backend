// Retrouve l'article (actif OU désactivé) qui possède un code-barre donné —
// utile car la recherche normale de l'appli ignore les articles désactivés.
//
// Usage :
//   node src/scripts/trouverParCodeBarre.js 6751410896649

require('dotenv').config();
const prisma = require('../lib/prisma');

async function main() {
  const codeBarre = process.argv[2];
  if (!codeBarre) {
    console.log('Usage : node src/scripts/trouverParCodeBarre.js <code-barre>');
    return;
  }

  const article = await prisma.article.findUnique({ where: { codeBarre } });
  if (!article) {
    console.log(`Aucun article (actif ou non) ne possède le code-barre ${codeBarre}.`);
    return;
  }

  console.log(`Trouvé : [${article.reference}] "${article.designation}"`);
  console.log(`  actif : ${article.actif ? 'oui' : 'NON — c\'est pour ça que la recherche ne le trouve pas'}`);
  console.log(`  stock actuel (tous lieux) : ${article.stockActuel}`);
  console.log(`  prix de vente : ${Number(article.prixVente).toLocaleString('fr-FR')} F`);
  console.log('\nPour libérer ce code-barre (si cet article ne doit plus l\'utiliser), utilise :');
  console.log(`  node src/scripts/libererCodeBarre.js ${article.reference}`);
}

main()
  .catch((err) => {
    console.error('Erreur :', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
