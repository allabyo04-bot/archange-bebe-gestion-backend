const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

const MODULES = ['VENTES', 'STOCK', 'ARTICLES', 'DEPENSES', 'RAPPORTS', 'UTILISATEURS'];

async function main() {
  // Rôles
  let admin = await prisma.role.findUnique({ where: { nom: 'Administrateur' } });
  if (!admin) {
    admin = await prisma.role.create({
      data: {
        nom: 'Administrateur',
        estAdmin: true,
        modifiable: false,
        permissions: { create: MODULES.map((module) => ({ module, actif: true })) },
      },
    });
    console.log('Rôle "Administrateur" créé.');
  }

  let caissier = await prisma.role.findUnique({ where: { nom: 'Caissier' } });
  if (!caissier) {
    caissier = await prisma.role.create({
      data: {
        nom: 'Caissier',
        estAdmin: false,
        modifiable: true,
        permissions: {
          create: MODULES.map((module) => ({
            module, actif: module === 'VENTES' || module === 'DEPENSES',
          })),
        },
      },
    });
    console.log('Rôle "Caissier" créé.');
  }

  // Lieux de base — Archange Bébé a 2 boutiques dès le départ, plus un entrepôt
  let entrepot = await prisma.lieu.findUnique({ where: { nom: 'Entrepôt principal' } });
  if (!entrepot) {
    entrepot = await prisma.lieu.create({ data: { nom: 'Entrepôt principal', type: 'ENTREPOT' } });
    console.log('Lieu "Entrepôt principal" créé.');
  }

  let boutiquePrincipale = await prisma.lieu.findUnique({ where: { nom: 'Boutique Principale' } });
  if (!boutiquePrincipale) {
    boutiquePrincipale = await prisma.lieu.create({ data: { nom: 'Boutique Principale', type: 'BOUTIQUE' } });
    console.log('Lieu "Boutique Principale" créé.');
  }

  let boutiqueSecondaire = await prisma.lieu.findUnique({ where: { nom: 'Boutique Secondaire' } });
  if (!boutiqueSecondaire) {
    boutiqueSecondaire = await prisma.lieu.create({ data: { nom: 'Boutique Secondaire', type: 'BOUTIQUE' } });
    console.log('Lieu "Boutique Secondaire" créé.');
  }

  // Compte Administrateur
  const existant = await prisma.utilisateur.findUnique({ where: { nomUtilisateur: 'administrateur' } });
  if (!existant) {
    const pinHache = await bcrypt.hash('1234', 10);
    await prisma.utilisateur.create({
      data: {
        nomUtilisateur: 'administrateur',
        pin: pinHache,
        nomComplet: 'Administrateur',
        role: 'ADMIN',
        roleId: admin.id,
        lieuId: boutiquePrincipale.id,
      },
    });
    console.log('Compte "administrateur" créé (PIN 1234).');
  } else {
    console.log('Compte "administrateur" déjà existant, ignoré.');
  }

  // Dénominations de cartes cadeaux de base
  const denominationsBase = [5000, 10000, 20000, 50000];
  for (const montant of denominationsBase) {
    const existante = await prisma.denominationCarteCadeau.findUnique({ where: { montant } });
    if (!existante) {
      await prisma.denominationCarteCadeau.create({ data: { montant } });
      console.log(`Dénomination ${montant} F créée.`);
    }
  }

  // Catégories de dépenses de base
  const categoriesBase = [
    'Loyer', 'Électricité', 'Eau', 'Internet/Téléphone', 'Salaires', 'Transport',
    'Fournitures', 'Entretien/Réparations', 'Marketing/Publicité', 'Emballages',
    'Frais bancaires', 'Impôts/Taxes', 'Divers',
  ];
  for (const nom of categoriesBase) {
    const existante = await prisma.categorieDepense.findUnique({ where: { nom } });
    if (!existante) {
      await prisma.categorieDepense.create({ data: { nom } });
      console.log(`Catégorie "${nom}" créée.`);
    }
  }

  console.log('Terminé.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
