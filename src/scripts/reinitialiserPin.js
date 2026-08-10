// Réinitialise le PIN d'un utilisateur (généralement un compte Administrateur
// dont le PIN a été oublié). Le PIN n'est jamais stocké en clair (bcrypt) —
// impossible de le "retrouver", seulement de le remplacer par un nouveau.
//
// Usage :
//   node src/scripts/reinitialiserPin.js                                   → liste tous les comptes ADMIN
//   node src/scripts/reinitialiserPin.js <nomUtilisateur> <nouveauPin>            → aperçu seul
//   node src/scripts/reinitialiserPin.js <nomUtilisateur> <nouveauPin> --confirm  → applique réellement

require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

async function main() {
  const nomUtilisateur = process.argv[2];
  const nouveauPin = process.argv[3];
  const CONFIRME = process.argv.includes('--confirm');

  if (!nomUtilisateur) {
    console.log('Comptes ADMIN existants :\n');
    const admins = await prisma.utilisateur.findMany({ where: { role: 'ADMIN' } });
    for (const a of admins) {
      console.log(`  - nomUtilisateur: "${a.nomUtilisateur}" — nom complet: "${a.nomComplet}" — actif: ${a.actif ? 'oui' : 'non'}`);
    }
    console.log('\nRelance avec : node src/scripts/reinitialiserPin.js <nomUtilisateur> <nouveauPin>');
    return;
  }

  if (!nouveauPin) {
    console.log('Indique aussi le nouveau PIN souhaité : node src/scripts/reinitialiserPin.js <nomUtilisateur> <nouveauPin>');
    return;
  }
  if (!/^\d{4,8}$/.test(nouveauPin)) {
    console.log('Le PIN doit être uniquement composé de chiffres (4 à 8 chiffres).');
    return;
  }

  const utilisateur = await prisma.utilisateur.findUnique({ where: { nomUtilisateur } });
  if (!utilisateur) {
    console.log(`Aucun utilisateur avec le nom "${nomUtilisateur}".`);
    return;
  }

  console.log(`Compte trouvé : "${utilisateur.nomComplet}" (${utilisateur.nomUtilisateur}) — rôle : ${utilisateur.role} — actif : ${utilisateur.actif ? 'oui' : 'non'}`);
  console.log(`Nouveau PIN prévu : ${nouveauPin}`);

  if (!CONFIRME) {
    console.log('\nAperçu seul — rien n\'a été modifié.');
    console.log('Relance avec --confirm pour appliquer réellement ce changement.');
    return;
  }

  const pinHache = await bcrypt.hash(nouveauPin, 10);
  await prisma.utilisateur.update({ where: { id: utilisateur.id }, data: { pin: pinHache } });
  console.log(`\nPIN réinitialisé avec succès pour "${utilisateur.nomUtilisateur}". Tu peux te connecter avec ce nouveau PIN dès maintenant.`);
}

main()
  .catch((err) => {
    console.error('Erreur :', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
