// Purge tous les articles dont la désignation contient "KIT NAISSANCE" —
// pour tout recréer proprement à la main (stock + étiquettes).
//
// SÉCURITÉ : ce script ne fait JAMAIS de suppression ou désactivation tant
// qu'il n'a pas d'abord affiché un aperçu complet, incluant si l'article a
// déjà des ventes/mouvements enregistrés (une suppression définitive casse
// la base si l'article a un historique — une désactivation, elle, ne casse
// jamais rien).
//
// Usage :
//   node src/scripts/purgerKitNaissance.js                       → aperçu seul
//   node src/scripts/purgerKitNaissance.js --desactiver          → désactive (sûr, réversible, historique conservé)
//   node src/scripts/purgerKitNaissance.js --supprimer           → supprime définitivement (échoue si historique existant)

require('dotenv').config();
const prisma = require('../lib/prisma');

const MODE_DESACTIVER = process.argv.includes('--desactiver');
const MODE_SUPPRIMER = process.argv.includes('--supprimer');

const TEXTE_RECHERCHE = 'KIT NAISSANCE';

async function main() {
  const articles = await prisma.article.findMany({
    where: { designation: { contains: TEXTE_RECHERCHE, mode: 'insensitive' } },
    orderBy: { designation: 'asc' },
  });

  if (articles.length === 0) {
    console.log(`Aucun article trouvé avec "${TEXTE_RECHERCHE}" dans la désignation.`);
    return;
  }

  console.log(`${articles.length} article(s) trouvé(s) :\n`);

  const details = [];
  for (const a of articles) {
    const [nbVentes, nbReceptions, nbMouvements] = await Promise.all([
      prisma.ligneVente.count({ where: { articleId: a.id } }),
      prisma.ligneReception.count({ where: { articleId: a.id } }),
      prisma.mouvementStock.count({ where: { articleId: a.id } }),
    ]);
    const aHistorique = nbVentes > 0 || nbReceptions > 0 || nbMouvements > 0;
    details.push({ article: a, nbVentes, nbReceptions, nbMouvements, aHistorique });

    const statut = aHistorique
      ? `⚠️ historique : ${nbVentes} vente(s), ${nbReceptions} réception(s), ${nbMouvements} mouvement(s)`
      : '✓ aucun historique — suppression définitive possible';
    console.log(`  [${a.reference}] "${a.designation}" — actif: ${a.actif ? 'oui' : 'non'} — stock: ${a.stockActuel} — ${statut}`);
  }

  const avecHistorique = details.filter((d) => d.aHistorique);
  const sansHistorique = details.filter((d) => !d.aHistorique);

  console.log(`\n${sansHistorique.length} article(s) sans historique (suppression définitive OK).`);
  console.log(`${avecHistorique.length} article(s) avec historique (suppression définitive impossible sans casser des ventes passées).`);

  if (!MODE_DESACTIVER && !MODE_SUPPRIMER) {
    console.log('\nAperçu seul — rien n\'a été modifié.');
    console.log('Relance avec --desactiver (sûr, garde l\'historique) ou --supprimer (définitif, échoue sur les articles avec historique).');
    return;
  }

  if (MODE_DESACTIVER) {
    console.log('\nDésactivation en cours (tous les articles disparaissent des listes/recherches, historique conservé)...');
    for (const d of details) {
      await prisma.article.update({
        where: { id: d.article.id },
        data: { actif: false, quantiteAImprimer: 0 },
      });
      console.log(`  [${d.article.reference}] désactivé.`);
    }
    console.log(`\n${details.length} article(s) désactivé(s) avec succès.`);
    return;
  }

  if (MODE_SUPPRIMER) {
    console.log('\nSuppression définitive en cours...');
    let reussies = 0;
    let echouees = 0;
    for (const d of details) {
      try {
        await prisma.article.delete({ where: { id: d.article.id } });
        console.log(`  [${d.article.reference}] supprimé.`);
        reussies += 1;
      } catch (err) {
        console.log(`  [${d.article.reference}] ÉCHEC (probablement un historique lié) — ${err.message}`);
        echouees += 1;
      }
    }
    console.log(`\n${reussies} article(s) supprimé(s), ${echouees} échec(s).`);
    if (echouees > 0) {
      console.log('Pour les articles en échec, relance avec --desactiver pour au moins les masquer sans casser l\'historique.');
    }
  }
}

main()
  .catch((err) => {
    console.error('Erreur :', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
