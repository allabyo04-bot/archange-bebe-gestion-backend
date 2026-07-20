// Script à lancer UNE SEULE FOIS pour amorcer la base de données :
// - compte admin Victoria (PIN 1234)
// - lieux Entrepôt et Boutique
// - dénominations de cartes cadeaux (5000 / 10000 / 20000 / 50000)
// - catégories de dépenses (les 13 de La Pointure)
//
// Utilisation : node prisma/seed.js

const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');

const CATEGORIES_DEPENSES = [
  'Loyer', 'Électricité', 'Eau', 'Internet/Téléphone', 'Salaires',
  'Transport', 'Fournitures', 'Entretien/Réparation', 'Marketing/Publicité',
  'Emballages', 'Sécurité', 'Impôts/Taxes', 'Divers',
];

async function main() {
  // --- Compte admin Victoria ---
  const pinHache = await bcrypt.hash('1234', 10);
  const victoria = await prisma.utilisateur.upsert({
    where: { nomUtilisateur: 'victoria' },
    update: {},
    create: {
      nomUtilisateur: 'victoria',
      pin: pinHache,
      nomComplet: 'Victoria',
      role: 'ADMIN',
    },
  });
  console.log('Utilisateur admin prêt :', victoria.nomUtilisateur);

  // --- Lieux ---
  const entrepot = await prisma.lieu.upsert({
    where: { nom: 'Entrepôt principal' },
    update: {},
    create: { nom: 'Entrepôt principal', type: 'ENTREPOT' },
  });
  const boutique = await prisma.lieu.upsert({
    where: { nom: 'Boutique Jesma U' },
    update: {},
    create: { nom: 'Boutique Jesma U', type: 'BOUTIQUE' },
  });
  console.log('Lieux prêts :', entrepot.nom, '/', boutique.nom);

  // --- Dénominations cartes cadeaux ---
  for (const montant of [5000, 10000, 20000, 50000]) {
    await prisma.denominationCarteCadeau.upsert({
      where: { montant },
      update: {},
      create: { montant },
    });
  }
  console.log('Dénominations cartes cadeaux prêtes : 5000 / 10000 / 20000 / 50000');

  // --- Catégories de dépenses ---
  for (const nom of CATEGORIES_DEPENSES) {
    await prisma.categorieDepense.upsert({
      where: { nom },
      update: {},
      create: { nom },
    });
  }
  console.log('Catégories de dépenses prêtes :', CATEGORIES_DEPENSES.length);

  console.log('\nInitialisation terminée.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
