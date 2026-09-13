// Transfère TOUT le stock restant de la Boutique Secondaire (fermeture) vers
// la Boutique Principale, puis désactive la Boutique Secondaire pour qu'elle
// disparaisse des écrans de vente/réception/transfert (elle reste consultable
// dans l'historique, jamais supprimée).
//
// Chaque article concerné passe par un vrai mouvement de stock tracé
// (TRANSFERT_SORTIE côté Secondaire, TRANSFERT_ENTREE côté Principale) —
// rien n'est fait en douce, tout reste visible dans l'historique des
// mouvements comme un transfert normal.
//
// Sans danger à relancer : une fois le stock de la Secondaire à 0 partout,
// il n'y a plus rien à transférer, le script ne fait plus rien.
const prisma = require('../src/lib/prisma');
const { appliquerMouvementStock } = require('../src/lib/stock');

async function main() {
  const secondaire = await prisma.lieu.findUnique({ where: { nom: 'Boutique Secondaire' } });
  const principale = await prisma.lieu.findUnique({ where: { nom: 'Boutique Principale' } });
  const admin = await prisma.utilisateur.findFirst({ where: { role: 'ADMIN' }, orderBy: { id: 'asc' } });

  if (!secondaire || !principale) {
    console.log('[fermeture-secondaire] Boutique Secondaire ou Boutique Principale introuvable — rien fait.');
    return;
  }
  if (!admin) {
    console.log('[fermeture-secondaire] Aucun compte administrateur trouvé pour attribuer les mouvements — rien fait.');
    return;
  }

  const stocks = await prisma.stockEmplacement.findMany({
    where: { lieuId: secondaire.id, quantite: { gt: 0 } },
    include: { article: { select: { reference: true, designation: true } } },
  });

  if (stocks.length === 0) {
    console.log('[fermeture-secondaire] Aucun stock restant à transférer.');
  } else {
    console.log(`[fermeture-secondaire] ${stocks.length} article(s) à transférer vers Boutique Principale :`);
    for (const s of stocks) {
      await prisma.$transaction(async (tx) => {
        await appliquerMouvementStock(tx, {
          articleId: s.articleId, lieuId: secondaire.id, delta: -s.quantite,
          type: 'TRANSFERT_SORTIE', utilisateurId: admin.id,
          notes: 'Fermeture Boutique Secondaire — transfert vers Boutique Principale',
        });
        await appliquerMouvementStock(tx, {
          articleId: s.articleId, lieuId: principale.id, delta: s.quantite,
          type: 'TRANSFERT_ENTREE', utilisateurId: admin.id,
          notes: 'Fermeture Boutique Secondaire — reçu depuis Boutique Secondaire',
        });
      });
      console.log(`  - ${s.article.designation} (${s.article.reference}) : ${s.quantite} unité(s)`);
    }
  }

  if (secondaire.actif) {
    await prisma.lieu.update({ where: { id: secondaire.id }, data: { actif: false } });
    console.log('[fermeture-secondaire] Boutique Secondaire désactivée (n\'apparaît plus dans les écrans de vente/réception).');
  }

  console.log('[fermeture-secondaire] Terminé.');
}

main()
  .catch((e) => { console.error('[fermeture-secondaire] ERREUR:', e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
