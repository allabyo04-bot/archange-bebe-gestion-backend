// 1) Recrée l'article KNF19 (supprimé définitivement lors de la purge KIT
//    NAISSANCE), en conservant exactement son ancien code article, avec son
//    stock réel à Boutique Principale et un nouveau code-barre généré.
// 2) Met les 19 articles du comptage (les 18 déjà ajustés + le KNF19
//    recréé) dans la file "Étiquettes à imprimer" — il suffira ensuite
//    d'ouvrir la page Articles dans l'appli et de cliquer sur le bouton
//    "🖨️ Étiquettes à imprimer" pour tout imprimer d'un coup, avec les
//    bonnes quantités déjà pré-remplies.
//
// Usage :
//   node src/scripts/recreerKNF19EtPreparerEtiquettes.js              → aperçu seul
//   node src/scripts/recreerKNF19EtPreparerEtiquettes.js --confirm    → applique réellement

require('dotenv').config();
const prisma = require('../lib/prisma');
const { appliquerMouvementStock } = require('../lib/stock');
const { genererCodeBarreInterne } = require('../utils/barcode');

const CONFIRME = process.argv.includes('--confirm');
const NOM_BOUTIQUE = 'Boutique Principale';

const KNF19 = {
  reference: 'KNF19',
  designation: 'KIT NAISSANCE BABY GROWN 6PCS',
  prixVente: 10900,
  quantite: 30,
  codePrefixeSousFamille: 'KNF',
  numeroDansSousFamille: 19,
};

// Les 18 articles déjà réactivés/ajustés par le script précédent — on remet
// simplement leur quantité en file d'attente d'étiquettes, égale à leur
// quantité comptée.
const AUTRES_REFERENCES = [
  ['KNG26', 3], ['KNF13', 10], ['KNG21', 1], ['KNG19', 3], ['KNF11', 4],
  ['KNG11', 15], ['KNF08', 2], ['KNG05', 1], ['KNG04', 1], ['KNG01', 14],
  ['KNF00', 12], ['KNF07', 45], ['KNG08', 7], ['KNG15', 3], ['KNF09', 3],
  ['KNG17', 1], ['KNG16', 1], ['EGA10', 12],
];

async function main() {
  const boutique = await prisma.lieu.findUnique({ where: { nom: NOM_BOUTIQUE } });
  if (!boutique) { console.log(`Lieu "${NOM_BOUTIQUE}" introuvable.`); return; }

  const admin = await prisma.utilisateur.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) { console.log('Aucun utilisateur ADMIN trouvé.'); return; }

  const dejaExistant = await prisma.article.findUnique({ where: { reference: KNF19.reference } });

  console.log('--- 1) Recréation de KNF19 ---');
  if (dejaExistant) {
    console.log(`⚠️ [${KNF19.reference}] existe déjà en base (id ${dejaExistant.id}) — le script ne le recréera pas, il sera juste inclus dans la file d'étiquettes.`);
  } else {
    const sousFamille = await prisma.sousFamille.findFirst({ where: { codePrefixe: KNF19.codePrefixeSousFamille } });
    if (!sousFamille) {
      console.log(`Sous-famille de préfixe "${KNF19.codePrefixeSousFamille}" introuvable — impossible de recréer KNF19 automatiquement.`);
      return;
    }
    console.log(`  À créer : "${KNF19.designation}" — réf ${KNF19.reference} — prix ${KNF19.prixVente} F — stock ${KNF19.quantite} à ${NOM_BOUTIQUE} — sous-famille "${sousFamille.nom}" (id ${sousFamille.id})`);
    if (sousFamille.dernierNumero < KNF19.numeroDansSousFamille) {
      console.log(`  Le compteur de la sous-famille sera avancé à ${KNF19.numeroDansSousFamille} pour éviter tout doublon futur.`);
    }
  }

  console.log('\n--- 2) Préparation de la file d\'étiquettes (19 articles) ---');
  const toutesLesReferences = [...AUTRES_REFERENCES, [KNF19.reference, KNF19.quantite]];
  const introuvables = [];
  for (const [reference, quantite] of toutesLesReferences) {
    if (reference === KNF19.reference && !dejaExistant) {
      console.log(`  [${reference}] sera mis en file avec ${quantite} étiquette(s) après sa création.`);
      continue;
    }
    const article = await prisma.article.findUnique({ where: { reference } });
    if (!article) { introuvables.push(reference); continue; }
    console.log(`  [${reference}] "${article.designation}" — ${quantite} étiquette(s) à mettre en file.`);
  }
  if (introuvables.length > 0) {
    console.log(`\n⚠️ Introuvable(s), ignoré(s) : ${introuvables.join(', ')}`);
  }

  if (!CONFIRME) {
    console.log('\nAperçu seul — rien n\'a été modifié.');
    console.log('Relance avec --confirm pour appliquer réellement ces changements.');
    return;
  }

  console.log('\nApplication en cours...');

  let articleKNF19 = dejaExistant;
  if (!articleKNF19) {
    const sousFamille = await prisma.sousFamille.findFirst({ where: { codePrefixe: KNF19.codePrefixeSousFamille } });
    await prisma.$transaction(async (tx) => {
      articleKNF19 = await tx.article.create({
        data: {
          reference: KNF19.reference,
          designation: KNF19.designation.toUpperCase(),
          familleId: sousFamille.familleId,
          sousFamilleId: sousFamille.id,
          prixAchat: 0,
          prixVente: KNF19.prixVente,
          seuilAlerte: 5,
        },
      });
      const codeBarre = genererCodeBarreInterne(articleKNF19.id);
      articleKNF19 = await tx.article.update({
        where: { id: articleKNF19.id },
        data: { codeBarre, codeBarreGenere: true },
      });
      if (sousFamille.dernierNumero < KNF19.numeroDansSousFamille) {
        await tx.sousFamille.update({
          where: { id: sousFamille.id },
          data: { dernierNumero: KNF19.numeroDansSousFamille },
        });
      }
      await appliquerMouvementStock(tx, {
        articleId: articleKNF19.id,
        lieuId: boutique.id,
        delta: KNF19.quantite,
        type: 'CORRECTION_INVENTAIRE',
        utilisateurId: admin.id,
        notes: 'Recréation après purge KIT NAISSANCE — comptage physique Boutique Principale',
      });
    });
    console.log(`  [${articleKNF19.reference}] créé (id ${articleKNF19.id}), code-barre ${articleKNF19.codeBarre}, stock ${KNF19.quantite} à ${NOM_BOUTIQUE}.`);
  }

  for (const [reference, quantite] of toutesLesReferences) {
    const article = reference === KNF19.reference ? articleKNF19 : await prisma.article.findUnique({ where: { reference } });
    if (!article) continue;
    await prisma.article.update({
      where: { id: article.id },
      data: { quantiteAImprimer: quantite },
    });
    console.log(`  [${article.reference}] mis en file : ${quantite} étiquette(s).`);
  }

  console.log('\nTerminé. Ouvre la page Articles dans l\'appli et clique sur "🖨️ Étiquettes à imprimer" pour tout imprimer.');
}

main()
  .catch((err) => {
    console.error('Erreur :', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
