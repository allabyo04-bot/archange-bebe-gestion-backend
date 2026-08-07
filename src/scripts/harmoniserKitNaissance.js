// Harmonise toutes les désignations d'articles contenant "KIT DE NAISSANCE"
// en "KIT NAISSANCE" (le reste du texte, ex. taille/couleur, est conservé).
// Recherche insensible à la casse et aux accents/espaces multiples.
//
// Usage :
//   node src/scripts/harmoniserKitNaissance.js              → aperçu seul
//   node src/scripts/harmoniserKitNaissance.js --confirm    → exécute réellement

require('dotenv').config();
const prisma = require('../lib/prisma');

const CONFIRME = process.argv.includes('--confirm');

const AVANT = 'KIT DE NAISSANCE';
const APRES = 'KIT NAISSANCE';

async function main() {
  const articles = await prisma.article.findMany({
    where: { designation: { contains: AVANT, mode: 'insensitive' }, actif: true },
    orderBy: { designation: 'asc' },
  });

  if (articles.length === 0) {
    console.log(`Aucun article trouvé avec "${AVANT}" dans la désignation.`);
    return;
  }

  console.log(`${articles.length} article(s) trouvé(s) :\n`);

  const modifications = articles.map((a) => {
    // Remplace la portion "KIT DE NAISSANCE" (quelle que soit sa casse) par "KIT NAISSANCE",
    // sans toucher au reste du texte (taille, couleur, etc.).
    const regex = new RegExp(AVANT.replace(/ /g, '\\s+'), 'i');
    const nouvelleDesignation = a.designation.replace(regex, APRES).trim().toUpperCase();
    return { id: a.id, reference: a.reference, avant: a.designation, apres: nouvelleDesignation };
  });

  modifications.forEach((m) => {
    console.log(`  [${m.reference}] "${m.avant}"  →  "${m.apres}"`);
  });

  if (!CONFIRME) {
    console.log('\nAperçu seul — rien n\'a été modifié.');
    console.log('Relance avec --confirm pour appliquer réellement ces changements.');
    return;
  }

  console.log('\nApplication des changements...');
  for (const m of modifications) {
    await prisma.article.update({ where: { id: m.id }, data: { designation: m.apres } });
  }
  console.log(`${modifications.length} article(s) mis à jour avec succès.`);
}

main()
  .catch((err) => {
    console.error('Erreur :', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
