const prisma = require('../lib/prisma');

const MODULES = ['VENTES', 'STOCK', 'ARTICLES', 'DEPENSES', 'RAPPORTS', 'UTILISATEURS'];

async function main() {
  // Rôle Administrateur : verrouillé, tous les modules actifs.
  let admin = await prisma.role.findUnique({ where: { nom: 'Administrateur' } });
  if (!admin) {
    admin = await prisma.role.create({
      data: {
        nom: 'Administrateur',
        estAdmin: true,
        modifiable: false,
        permissions: {
          create: MODULES.map((module) => ({ module, actif: true })),
        },
      },
    });
    console.log('Rôle "Administrateur" créé.');
  } else {
    console.log('Rôle "Administrateur" déjà existant, ignoré.');
  }

  // Rôle Caissier : reprend les droits actuels du rôle codé en dur (Ventes + Dépenses).
  let caissier = await prisma.role.findUnique({ where: { nom: 'Caissier' } });
  if (!caissier) {
    caissier = await prisma.role.create({
      data: {
        nom: 'Caissier',
        estAdmin: false,
        modifiable: true,
        permissions: {
          create: MODULES.map((module) => ({
            module,
            actif: module === 'VENTES' || module === 'DEPENSES',
          })),
        },
      },
    });
    console.log('Rôle "Caissier" créé.');
  } else {
    console.log('Rôle "Caissier" déjà existant, ignoré.');
  }

  // Rattache chaque utilisateur existant à son rôle correspondant, s'il n'en a pas déjà un.
  const utilisateursSansRole = await prisma.utilisateur.findMany({ where: { roleId: null } });
  for (const u of utilisateursSansRole) {
    const roleCible = u.role === 'ADMIN' ? admin : caissier;
    await prisma.utilisateur.update({ where: { id: u.id }, data: { roleId: roleCible.id } });
    console.log(`Utilisateur "${u.nomComplet}" (${u.role}) rattaché au rôle "${roleCible.nom}".`);
  }

  console.log('Terminé.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());