// Réactive tous les comptes ADMIN — filet de sécurité en cas de désactivation
// accidentelle de tous les comptes (y compris le sien), qui bloquerait tout
// accès à l'application. Sans effet une fois les comptes admin déjà actifs.
const prisma = require('../src/lib/prisma');

async function main() {
  const resultat = await prisma.utilisateur.updateMany({
    where: { role: 'ADMIN', actif: false },
    data: { actif: true },
  });
  console.log(`[reactiver-admins] ${resultat.count} compte(s) administrateur réactivé(s).`);
}

main()
  .catch((e) => { console.error('[reactiver-admins] ERREUR:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
