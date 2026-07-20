require('dotenv').config();
const prisma = require('../lib/prisma');

// Exporte les données importantes de la base. Le mot de passe (pin) des
// utilisateurs est volontairement exclu de l'export.
async function exporterDonnees() {
  const [
    ventes, clients, articles, stocks, depenses, mouvements,
    recompenses, utilisateurs, vendeurs, lieux, cartesCadeaux,
    listesCadeaux, avoirs, roles,
  ] = await Promise.all([
    prisma.vente.findMany({ include: { lignes: true, paiements: true } }),
    prisma.client.findMany(),
    prisma.article.findMany(),
    prisma.stockEmplacement.findMany(),
    prisma.depense.findMany(),
    prisma.mouvementStock.findMany(),
    prisma.recompenseFidelite.findMany(),
    prisma.utilisateur.findMany({
      select: {
        id: true, nomUtilisateur: true, nomComplet: true, role: true,
        roleId: true, lieuId: true, actif: true, createdAt: true,
      },
    }),
    prisma.vendeur.findMany(),
    prisma.lieu.findMany(),
    prisma.carteCadeau.findMany(),
    prisma.listeCadeau.findMany(),
    prisma.avoir.findMany(),
    prisma.role.findMany({ include: { permissions: true } }),
  ]);

  return {
    dateExport: new Date().toISOString(),
    ventes, clients, articles, stocks, depenses, mouvements,
    recompenses, utilisateurs, vendeurs, lieux, cartesCadeaux,
    listesCadeaux, avoirs, roles,
  };
}

async function envoyerSauvegarde() {
  const donnees = await exporterDonnees();
  const contenu = JSON.stringify(donnees, null, 2);
  const dateTexte = new Date().toISOString().slice(0, 10);
  const contenuBase64 = Buffer.from(contenu, 'utf-8').toString('base64');

  const reponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.BACKUP_RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Jesma U Sauvegarde <onboarding@resend.dev>',
      to: [process.env.BACKUP_EMAIL_DESTINATAIRE],
      subject: `Sauvegarde Jesma U — ${dateTexte}`,
      text: `Sauvegarde automatique des données Jesma U du ${dateTexte}.\n\nNombre de ventes : ${donnees.ventes.length}\nNombre de clients : ${donnees.clients.length}\nNombre d'articles : ${donnees.articles.length}`,
      attachments: [
        {
          filename: `jesma-u-sauvegarde-${dateTexte}.json`,
          content: contenuBase64,
        },
      ],
    }),
  });

  if (!reponse.ok) {
    const erreurTexte = await reponse.text();
    throw new Error(`Échec de l'envoi (${reponse.status}) : ${erreurTexte}`);
  }

  console.log(`Sauvegarde envoyée avec succès (${dateTexte}).`);
}

envoyerSauvegarde()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Échec de la sauvegarde :', err);
    process.exit(1);
  });