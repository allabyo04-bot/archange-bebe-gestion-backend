// Import en masse des photos d'articles (galerie multi-photos) -> Archange Bébé
//
// Usage :
//   node src/scripts/importPhotosArticles.js              → aperçu seul, ne touche PAS la base ni Cloudinary
//   node src/scripts/importPhotosArticles.js --confirm    → exécute réellement l'import (upload + écriture en base)
//
// Dossier attendu : ./import-data/PHOTOS/ (à la racine du backend), contenant les
// photos nommées par code article, ex :
//   BBR0163.jpg          -> 1 photo pour l'article BBR0163
//   BBR0163_1.jpg        -> 2e photo pour BBR0163
//   BBR0163_2.jpg        -> 3e photo pour BBR0163
//   ROB56.jpg + ROB56 (2).jpg  -> 2 photos pour ROB56
//
// La correspondance code -> article se fait sur Article.reference, insensible à la casse.
// Pour un même article, la photo "de base" (sans suffixe) est uploadée en premier et devient
// automatiquement la photo principale SEULEMENT si l'article n'a encore aucune photo en base
// (les articles qui ont déjà une photo, ajoutée manuellement, ne sont jamais réordonnés :
// les nouvelles photos importées s'ajoutent simplement à la suite).
//
// Fichiers dont le nom ne correspond à aucune référence connue sont listés en fin d'aperçu
// sans bloquer le reste de l'import.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const cloudinary = require('../../config/cloudinary');
const prisma = require('../lib/prisma');

const DOSSIER_PHOTOS = path.join(__dirname, '../../import-data/PHOTOS');
const CONFIRME = process.argv.includes('--confirm');
const EXTENSIONS_VALIDES = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// Extrait { code, ordre } d'un nom de fichier.
//   "BBR0163.jpg"      -> { code: 'BBR0163', ordre: 0 }
//   "BBR0163_1.jpg"    -> { code: 'BBR0163', ordre: 1 }
//   "ROB56 (2).jpg"    -> { code: 'ROB56',   ordre: 2 }
// Retourne null si le nom ne suit aucun de ces formats (fichier non apparié).
function analyserNomFichier(nomFichier) {
  const ext = path.extname(nomFichier).toLowerCase();
  if (!EXTENSIONS_VALIDES.has(ext)) return null;
  const base = path.basename(nomFichier, path.extname(nomFichier));

  let m = /^(.+)_(\d+)$/.exec(base);
  if (m) return { code: m[1].trim(), ordre: parseInt(m[2], 10) };

  m = /^(.+)\s*\((\d+)\)$/.exec(base);
  if (m) return { code: m[1].trim(), ordre: parseInt(m[2], 10) };

  if (/^[A-Za-zÀ-ÿ0-9]+$/.test(base)) return { code: base.trim(), ordre: 0 };

  return null;
}

async function construirePlan() {
  if (!fs.existsSync(DOSSIER_PHOTOS)) {
    throw new Error(`Dossier introuvable : ${DOSSIER_PHOTOS}\nPlace le dossier PHOTOS extrait de l'archive dans backend/import-data/PHOTOS/`);
  }

  const fichiers = fs.readdirSync(DOSSIER_PHOTOS);
  const parCode = new Map(); // code (tel qu'écrit dans le nom de fichier) -> [{ fichier, ordre }]
  const nonApparies = [];

  for (const fichier of fichiers) {
    const cheminComplet = path.join(DOSSIER_PHOTOS, fichier);
    if (!fs.statSync(cheminComplet).isFile()) continue;

    const analyse = analyserNomFichier(fichier);
    if (!analyse) {
      nonApparies.push({ fichier, raison: 'nom de fichier ne suit pas le format attendu (CODE / CODE_1 / CODE (1))' });
      continue;
    }
    if (!parCode.has(analyse.code)) parCode.set(analyse.code, []);
    parCode.get(analyse.code).push({ fichier, ordre: analyse.ordre });
  }

  // Trie les photos de chaque code par ordre croissant (la photo "de base" en premier)
  for (const liste of parCode.values()) {
    liste.sort((a, b) => a.ordre - b.ordre);
  }

  // Résolution des articles (recherche insensible à la casse sur reference)
  const plan = []; // { code, article, photos: [{ fichier }] }
  for (const [code, photos] of parCode) {
    const article = await prisma.article.findFirst({
      where: { reference: { equals: code, mode: 'insensitive' } },
    });
    if (!article) {
      nonApparies.push({ fichier: photos.map((p) => p.fichier).join(', '), raison: `code "${code}" ne correspond à aucun article` });
      continue;
    }
    const photosExistantes = await prisma.photoArticle.count({ where: { articleId: article.id } });
    plan.push({ code, article, photos, photosExistantes });
  }

  return { plan, nonApparies, totalFichiers: fichiers.length };
}

function afficherApercu({ plan, nonApparies, totalFichiers }) {
  console.log('='.repeat(70));
  console.log('APERÇU IMPORT PHOTOS ARTICLES (aucune écriture, aucun upload)');
  console.log('='.repeat(70));
  console.log(`Fichiers trouvés dans le dossier : ${totalFichiers}`);
  console.log(`Articles qui vont recevoir au moins une photo : ${plan.length}`);
  const totalPhotos = plan.reduce((acc, p) => acc + p.photos.length, 0);
  console.log(`Photos à uploader au total : ${totalPhotos}`);

  const avecPlusieurs = plan.filter((p) => p.photos.length > 1);
  console.log(`Articles avec plusieurs photos : ${avecPlusieurs.length}`);
  if (avecPlusieurs.length) {
    console.log('  Exemples :');
    for (const p of avecPlusieurs.slice(0, 10)) {
      console.log(`    ${p.article.reference} (${p.article.designation}) -> ${p.photos.length} photo(s) : ${p.photos.map((ph) => ph.fichier).join(', ')}`);
    }
  }

  const dejaAvecPhoto = plan.filter((p) => p.photosExistantes > 0);
  if (dejaAvecPhoto.length) {
    console.log(`\nArticles qui ont DÉJÀ au moins une photo en base (les nouvelles s'ajouteront à la suite, sans toucher à la photo principale actuelle) : ${dejaAvecPhoto.length}`);
    for (const p of dejaAvecPhoto.slice(0, 10)) {
      console.log(`    ${p.article.reference} — ${p.photosExistantes} photo(s) déjà présente(s)`);
    }
  }

  console.log(`\nFichiers non appariés (ignorés) : ${nonApparies.length}`);
  for (const n of nonApparies) {
    console.log(`  - ${n.fichier} (${n.raison})`);
  }

  console.log('\nRelance avec --confirm pour exécuter réellement l\'import.');
}

async function executerImport({ plan }) {
  console.log(`Exécution de l'import (upload Cloudinary + écriture en base) pour ${plan.length} article(s)...\n`);

  async function avecReessai(fn, tentatives = 4) {
    for (let i = 1; i <= tentatives; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === tentatives) throw err;
        console.log(`    (échec, nouvelle tentative ${i + 1}/${tentatives}...)`);
        await new Promise((r) => setTimeout(r, 2000 * i));
      }
    }
  }

  let articlesTraites = 0;
  let photosUploadees = 0;
  let echecs = 0;

  for (const item of plan) {
    const { article, photos, photosExistantes } = item;
    console.log(`[${++articlesTraites}/${plan.length}] ${article.reference} — ${article.designation} (${photos.length} photo(s))`);

    let ordreCourant = photosExistantes;
    let uneAuMoinsReussie = false;

    for (const photo of photos) {
      const cheminComplet = path.join(DOSSIER_PHOTOS, photo.fichier);
      try {
        const resultat = await avecReessai(() =>
          cloudinary.uploader.upload(cheminComplet, { folder: 'archange-bebe/articles', resource_type: 'image' })
        );

        const estPremierePhotoDeLArticle = photosExistantes === 0 && ordreCourant === 0;

        await prisma.photoArticle.create({
          data: {
            articleId: article.id,
            url: resultat.secure_url,
            ordre: ordreCourant,
            estPrincipale: estPremierePhotoDeLArticle,
          },
        });

        if (estPremierePhotoDeLArticle) {
          await prisma.article.update({ where: { id: article.id }, data: { photoUrl: resultat.secure_url } });
        }

        console.log(`    ✓ ${photo.fichier}`);
        ordreCourant++;
        photosUploadees++;
        uneAuMoinsReussie = true;
      } catch (err) {
        console.log(`    ✗ ${photo.fichier} — échec : ${err.message}`);
        echecs++;
      }
    }

    if (!uneAuMoinsReussie) continue;
  }

  console.log('\n' + '='.repeat(70));
  console.log(`Import terminé : ${photosUploadees} photo(s) uploadée(s) avec succès, ${echecs} échec(s).`);
  if (echecs > 0) {
    console.log('Relance simplement le script (aperçu puis --confirm) pour retenter les fichiers en échec :');
    console.log('les articles déjà pourvus de photos ne seront pas retraités à l\'identique, seuls les fichiers');
    console.log('correspondant à des codes encore présents dans le dossier seront réessayés — pense à retirer');
    console.log('du dossier les fichiers déjà importés avec succès avant de relancer, pour éviter les doublons.');
  }
}

async function main() {
  const resultat = await construirePlan();
  if (!CONFIRME) {
    afficherApercu(resultat);
  } else {
    await executerImport(resultat);
  }
}

main()
  .catch((e) => { console.error('ERREUR :', e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
