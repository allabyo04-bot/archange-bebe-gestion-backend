// À lancer UNE SEULE FOIS pour créer (ou corriger) le client générique "Client Comptoir",
// utilisé par défaut quand aucun client n'est choisi pendant une vente.
// Usage : node src/scripts/creerClientComptoir.js
require('dotenv').config();
const prisma = require('../lib/prisma');

async function main() {
  const existant = await prisma.client.findFirst({ where: { nomComplet: 'Client Comptoir' } });

  if (existant) {
    if (existant.estComptoir) {
      console.log('"Client Comptoir" existe déjà et est correctement marqué. Rien à faire.');
      return;
    }
    await prisma.client.update({ where: { id: existant.id }, data: { estComptoir: true } });
    console.log('"Client Comptoir" existait déjà — marqué comme client générique.');
    return;
  }

  const client = await prisma.client.create({
    data: { nomComplet: 'Client Comptoir', estComptoir: true },
  });
  console.log(`"Client Comptoir" créé (id ${client.id}).`);
}

main()
  .catch((err) => { console.error('Erreur :', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
