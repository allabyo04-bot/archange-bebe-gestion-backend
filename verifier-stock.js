const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const articles = await prisma.article.findMany({
    include: { stocksEmplacement: { include: { lieu: true } } },
  });

  for (const a of articles) {
    console.log(`\n--- Article #${a.id} : ${a.designation} (${a.reference}) ---`);
    console.log('stockActuel (total) :', a.stockActuel);
    if (a.stocksEmplacement.length === 0) {
      console.log('  Aucune ligne StockEmplacement pour cet article.');
    }
    for (const se of a.stocksEmplacement) {
      console.log(`  ${se.lieu.nom} : ${se.quantite}`);
    }
  }

  const lieux = await prisma.lieu.findMany();
  console.log('\n--- Lieux existants ---');
  console.log(lieux);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
