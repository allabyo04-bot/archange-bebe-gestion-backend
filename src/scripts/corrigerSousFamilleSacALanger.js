// Corrige le classement de 40 articles (famille SAC) vers la nouvelle sous-famille
// "SAC A LANGER" — identifiés par leur référence, extraits de la feuille d'inventaire
// fournie par l'utilisateur (30/07/2026).
//
// Usage :
//   node src/scripts/corrigerSousFamilleSacALanger.js              → aperçu seul
//   node src/scripts/corrigerSousFamilleSacALanger.js --confirm    → exécute réellement

require('dotenv').config();
const prisma = require('../lib/prisma');

const CONFIRME = process.argv.includes('--confirm');

const NOM_FAMILLE = 'SAC';
const NOM_SOUS_FAMILLE_CIBLE = 'SAC A LANGER';
const PREFIXE_SOUS_FAMILLE_CIBLE = 'SACL'; // sert uniquement aux futurs articles créés dedans

const REFERENCES = [
  'SAC0000', 'SAC0001', 'SAC0002', 'SAC0034', 'SAC0033', 'SAC0032', 'SAC0077', 'SAC0008',
  'SAC0073', 'SAC0072', 'SAC0067', 'SAC0068', 'SAC0003', 'SAC0017', 'SAC0039', 'SAC0006',
  'SAC0007', 'SAC0010', 'SAC0015', 'SAC0011', 'SAC0012', 'SAC0014', 'SAC0069', 'SAC0021',
  'SAC0063', 'SAC0041', 'SAC0040', 'SAC0020', 'SAC0026', 'SAC00116', 'SAC0009', 'SAC0037',
  'SAC0035', 'SAC0036', 'SAC0038', 'SAC0005', 'SAC0004', 'SAC0023', 'SAC0025', 'SAC0079',
];

async function main() {
  const famille = await prisma.famille.findFirst({ where: { nom: { equals: NOM_FAMILLE, mode: 'insensitive' } } });
  if (!famille) throw new Error(`Famille "${NOM_FAMILLE}" introuvable.`);

  let sousFamilleCible = await prisma.sousFamille.findFirst({
    where: { familleId: famille.id, nom: { equals: NOM_SOUS_FAMILLE_CIBLE, mode: 'insensitive' } },
  });

  const articles = await prisma.article.findMany({
    where: { reference: { in: REFERENCES } },
    include: { sousFamille: true },
  });
  const parReference = Object.fromEntries(articles.map((a) => [a.reference.toUpperCase(), a]));
  const introuvables = REFERENCES.filter((r) => !parReference[r.toUpperCase()]);

  console.log('='.repeat(70));
  console.log(CONFIRME ? 'EXÉCUTION' : 'APERÇU (aucune écriture en base)');
  console.log('='.repeat(70));
  console.log(`Famille "${NOM_FAMILLE}" : ${famille ? 'trouvée' : 'introuvable'} (id ${famille.id})`);
  console.log(
    sousFamilleCible
      ? `Sous-famille "${NOM_SOUS_FAMILLE_CIBLE}" : déjà existante (id ${sousFamilleCible.id}, préfixe ${sousFamilleCible.codePrefixe})`
      : `Sous-famille "${NOM_SOUS_FAMILLE_CIBLE}" : sera créée (préfixe ${PREFIXE_SOUS_FAMILLE_CIBLE})`
  );
  console.log(`\nArticles trouvés : ${articles.length} / ${REFERENCES.length}`);
  if (introuvables.length > 0) {
    console.log(`⚠️  Références introuvables (ignorées) : ${introuvables.join(', ')}`);
  }
  console.log('\nDétail :');
  for (const a of articles) {
    console.log(`  ${a.reference} — ${a.designation} — actuellement : ${a.sousFamille?.nom || 'aucune sous-famille'}`);
  }

  if (!CONFIRME) {
    console.log('\nRelance avec --confirm pour appliquer réellement le déplacement.');
    return;
  }

  if (!sousFamilleCible) {
    sousFamilleCible = await prisma.sousFamille.create({
      data: { nom: NOM_SOUS_FAMILLE_CIBLE, familleId: famille.id, codePrefixe: PREFIXE_SOUS_FAMILLE_CIBLE, dernierNumero: 0 },
    });
    console.log(`\nSous-famille "${NOM_SOUS_FAMILLE_CIBLE}" créée (id ${sousFamilleCible.id}).`);
  }

  const resultat = await prisma.article.updateMany({
    where: { id: { in: articles.map((a) => a.id) } },
    data: { sousFamilleId: sousFamilleCible.id, familleId: famille.id },
  });

  console.log(`\n${resultat.count} article(s) déplacé(s) vers "${NOM_SOUS_FAMILLE_CIBLE}".`);
}

main()
  .catch((e) => { console.error('ERREUR :', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
