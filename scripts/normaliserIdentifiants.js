// Met en minuscule tous les identifiants (nomUtilisateur) déjà en base — la
// connexion vient d'être corrigée pour ne plus être sensible à la casse, mais
// les comptes créés avant ce correctif peuvent avoir un identifiant stocké
// avec une casse différente de ce que la personne tape habituellement.
// Sans danger à relancer : une fois tous les identifiants en minuscule, il
// n'y a plus rien à changer.
const prisma = require('../src/lib/prisma');

async function main() {
  const utilisateurs = await prisma.utilisateur.findMany();
  let nbCorriges = 0;

  for (const u of utilisateurs) {
    const minuscule = u.nomUtilisateur.trim().toLowerCase();
    if (minuscule !== u.nomUtilisateur) {
      await prisma.utilisateur.update({ where: { id: u.id }, data: { nomUtilisateur: minuscule } });
      console.log(`[normaliser-identifiants] ${u.nomUtilisateur} -> ${minuscule}`);
      nbCorriges += 1;
    }
  }

  console.log(`[normaliser-identifiants] ${nbCorriges} identifiant(s) corrigé(s).`);
}

main()
  .catch((e) => { console.error('[normaliser-identifiants] ERREUR:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
