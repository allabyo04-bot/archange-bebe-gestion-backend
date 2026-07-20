// Enregistre une action sensible dans le journal d'activité.
// Accepte soit le client Prisma normal, soit un client de transaction (tx),
// pour pouvoir être appelée à l'intérieur d'un prisma.$transaction existant.
async function enregistrerActivite(client, { type, description, utilisateurId }) {
  await client.journalActivite.create({
    data: { type, description, utilisateurId },
  });
}

module.exports = { enregistrerActivite };
