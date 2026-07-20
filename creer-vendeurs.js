const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const vendeurs = await prisma.vendeur.createMany({
    data: [
      { nomComplet: 'Fatou Koné' },
      { nomComplet: 'Aïcha Diabaté' },
    ],
    skipDuplicates: true,
  });
  console.log('Vendeurs créés :', vendeurs);

  const liste = await prisma.vendeur.findMany();
  console.log('Liste actuelle :', liste);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
