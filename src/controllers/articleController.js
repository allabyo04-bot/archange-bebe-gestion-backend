const cloudinary = require('../../config/cloudinary');
const prisma = require('../lib/prisma');
const { genererCodeBarreInterne } = require('../utils/barcode');
const { genererSvgEAN13 } = require('../utils/ean13');
const { enregistrerActivite } = require('../lib/journal');

// GET /api/articles?familleId=&sousFamilleId=&enStock=true&q=&prix=
async function listerArticles(req, res) {
  const { familleId, sousFamilleId, enStock, q, prix } = req.query;

  const where = { actif: true };
  if (familleId) where.familleId = Number(familleId);
  if (sousFamilleId) where.sousFamilleId = Number(sousFamilleId);
  if (enStock === 'true') where.stockActuel = { gt: 0 };
  if (q && q.trim()) where.designation = { contains: q.trim(), mode: 'insensitive' };
  if (prix !== undefined && prix !== '' && !Number.isNaN(Number(prix))) where.prixVente = Number(prix);

  const articles = await prisma.article.findMany({
    where,
    include: { famille: true, sousFamille: true, photos: { orderBy: { ordre: 'asc' } } },
    orderBy: { designation: 'asc' },
  });
  res.json(articles);
}

// GET /api/articles/recherche?q=...&lieuId=...
async function rechercherArticle(req, res) {
  const q = (req.query.q || '').trim();
  const lieuId = req.query.lieuId ? Number(req.query.lieuId) : null;
  if (!q) return res.status(400).json({ error: 'Paramètre de recherche "q" requis.' });

  async function ajouterStockLieu(articles) {
    if (!lieuId) return articles;
    const ids = articles.map((a) => a.id);
    const stocks = await prisma.stockEmplacement.findMany({
      where: { lieuId, articleId: { in: ids } },
    });
    const parArticle = Object.fromEntries(stocks.map((s) => [s.articleId, s.quantite]));
    return articles.map((a) => ({ ...a, stockLieu: parArticle[a.id] ?? 0 }));
  }

  const inclurePhotos = { photos: { orderBy: { ordre: 'asc' } } };
  let article = await prisma.article.findFirst({ where: { codeBarre: q, actif: true }, include: inclurePhotos });
  if (!article) {
    article = await prisma.article.findFirst({ where: { codeInterne: q, actif: true }, include: inclurePhotos });
  }
  if (!article) {
    article = await prisma.article.findFirst({ where: { reference: { equals: q, mode: 'insensitive' }, actif: true }, include: inclurePhotos });
  }
  if (article) {
    const [resultat] = await ajouterStockLieu([article]);
    return res.json({ mode: 'exact', resultats: [resultat] });
  }

  const resultats = await prisma.article.findMany({
    where: {
      actif: true,
      OR: [
        { designation: { contains: q, mode: 'insensitive' } },
        { reference: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 20,
    orderBy: { designation: 'asc' },
  });
  const resultatsAvecStock = await ajouterStockLieu(resultats);
  res.json({ mode: 'recherche', resultats: resultatsAvecStock });
}

// POST /api/articles
async function creerArticle(req, res) {
  const {
    codeBarre, codeInterne, designation,
    familleId, sousFamilleId, prixAchat, prixVente, seuilAlerte, description,
  } = req.body;

  if (!designation || !familleId || !sousFamilleId || prixVente === undefined) {
    return res.status(400).json({ error: 'Désignation, famille, sous-famille et prix de vente sont requis.' });
  }

  try {
    const article = await prisma.$transaction(async (tx) => {
      const sousFamille = await tx.sousFamille.findUnique({ where: { id: Number(sousFamilleId) } });
      if (!sousFamille) throw new Error('Sous-famille introuvable.');

      const nouveauNumero = sousFamille.dernierNumero + 1;
      const reference = `${sousFamille.codePrefixe}${String(nouveauNumero).padStart(2, '0')}`;

      await tx.sousFamille.update({
        where: { id: sousFamille.id },
        data: { dernierNumero: nouveauNumero },
      });

      return tx.article.create({
        data: {
          reference,
          codeBarre: codeBarre || null,
          codeInterne: codeInterne || null,
          designation: designation.trim().toUpperCase(),
          familleId: Number(familleId),
          sousFamilleId: Number(sousFamilleId),
          prixAchat: prixAchat || 0,
          prixVente,
          seuilAlerte: seuilAlerte ?? 5,
          description: description && description.trim() ? description.trim() : null,
          creeParId: req.user.id,
        },
      });
    });

    res.status(201).json(article);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// PUT /api/articles/:id
async function modifierArticle(req, res) {
  const id = Number(req.params.id);
  const estAdmin = req.user.role === 'ADMIN';
  const {
    designation, familleId, sousFamilleId,
    prixAchat, prixVente, prixPromo, seuilAlerte, actif, description,
  } = req.body;

  const article = await prisma.article.findUnique({ where: { id }, include: { famille: true, sousFamille: true } });
  if (!article) return res.status(404).json({ error: 'Article introuvable.' });

  if (!designation || !familleId || !sousFamilleId || prixVente === undefined) {
    return res.status(400).json({ error: 'Désignation, famille, sous-famille et prix de vente sont requis.' });
  }
  if (!(Number(prixVente) >= 0)) {
    return res.status(400).json({ error: 'Le prix de vente doit être un nombre positif.' });
  }

  const sousFamille = await prisma.sousFamille.findUnique({ where: { id: Number(sousFamilleId) } });
  if (!sousFamille || sousFamille.familleId !== Number(familleId)) {
    return res.status(400).json({ error: "Cette sous-famille n'appartient pas à la famille choisie." });
  }

  const data = {
    designation: designation.trim().toUpperCase(),
    familleId: Number(familleId),
    sousFamilleId: Number(sousFamilleId),
    prixVente,
    prixPromo: prixPromo !== undefined ? (prixPromo === '' || prixPromo === null ? null : prixPromo) : article.prixPromo,
    seuilAlerte: seuilAlerte ?? article.seuilAlerte,
    description: description !== undefined ? ((description ?? '').trim() === '' ? null : description.trim()) : article.description,
  };
  // Réservé aux administrateurs : prix d'achat (un non-admin ne le voit même pas) et
  // activation/désactivation. Pour un non-admin, ces champs du corps de requête sont ignorés.
  if (estAdmin) {
    if (prixAchat !== undefined) data.prixAchat = prixAchat;
    if (actif !== undefined) data.actif = actif;
  }

  const misAJour = await prisma.article.update({ where: { id }, data });

  // ---- Traçabilité : ancien → nouveau, séparé « prix » / « autres informations » ----
  const fmt = (n) => `${Number(n).toLocaleString('fr-FR')} F`;
  const fmtOuTiret = (v) => (v === null || v === undefined ? '—' : fmt(v));
  const differe = (a, b) => Number(a) !== Number(b);

  const partiesPrix = [];
  if (estAdmin && differe(article.prixAchat, misAJour.prixAchat)) {
    partiesPrix.push(`prix d'achat ${fmt(article.prixAchat)} → ${fmt(misAJour.prixAchat)}`);
  }
  if (differe(article.prixVente, misAJour.prixVente)) {
    partiesPrix.push(`prix de vente ${fmt(article.prixVente)} → ${fmt(misAJour.prixVente)}`);
  }
  const ancienPromo = article.prixPromo === null ? null : Number(article.prixPromo);
  const nouveauPromo = misAJour.prixPromo === null ? null : Number(misAJour.prixPromo);
  if (ancienPromo !== nouveauPromo) {
    partiesPrix.push(`prix promo ${fmtOuTiret(ancienPromo)} → ${fmtOuTiret(nouveauPromo)}`);
  }

  const partiesAutres = [];
  if (article.designation !== misAJour.designation) {
    partiesAutres.push(`désignation « ${article.designation} » → « ${misAJour.designation} »`);
  }
  if (article.familleId !== misAJour.familleId || article.sousFamilleId !== misAJour.sousFamilleId) {
    const nouvelleFamille = await prisma.famille.findUnique({ where: { id: misAJour.familleId } });
    partiesAutres.push(
      `rangement ${article.famille?.nom || '—'} / ${article.sousFamille?.nom || '—'} → ${nouvelleFamille?.nom || '—'} / ${sousFamille.nom}`,
    );
  }
  if (article.seuilAlerte !== misAJour.seuilAlerte) {
    partiesAutres.push(`seuil d'alerte ${article.seuilAlerte} → ${misAJour.seuilAlerte}`);
  }
  if ((article.description || '') !== (misAJour.description || '')) {
    partiesAutres.push('description modifiée');
  }
  if (estAdmin && article.actif !== misAJour.actif) {
    partiesAutres.push(misAJour.actif ? 'article réactivé' : 'article désactivé');
  }

  const libelle = `${article.designation} (${article.reference})`;
  if (partiesPrix.length > 0) {
    await enregistrerActivite(prisma, {
      type: 'MODIFICATION_PRIX_ARTICLE',
      description: `${libelle} — ${partiesPrix.join(', ')}`,
      utilisateurId: req.user.id,
    });
  }
  if (partiesAutres.length > 0) {
    await enregistrerActivite(prisma, {
      type: 'MODIFICATION_ARTICLE',
      description: `${libelle} — ${partiesAutres.join(', ')}`,
      utilisateurId: req.user.id,
    });
  }

  res.json(misAJour);
}

// POST /api/articles/:id/generer-code-barre
async function genererCodeBarre(req, res) {
  const id = Number(req.params.id);
  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) return res.status(404).json({ error: 'Article introuvable.' });
  if (article.codeBarre) {
    return res.status(400).json({ error: 'Cet article a déjà un code-barres.' });
  }

  const codeBarre = genererCodeBarreInterne(article.id);
  const misAJour = await prisma.article.update({
    where: { id },
    data: {
      codeBarre,
      codeBarreGenere: true,
    },
  });

  res.json(misAJour);
}

// GET /api/articles/a-imprimer
async function listerCodesAImprimer(req, res) {
  const articles = await prisma.article.findMany({
    where: { quantiteAImprimer: { gt: 0 }, actif: true },
    orderBy: { designation: 'asc' },
  });
  res.json(articles);
}

// POST /api/articles/a-imprimer/etiquettes   { lignes: [{ articleId, quantite }] }
async function imprimerEtiquettes(req, res) {
  const { lignes } = req.body;
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Aucune étiquette à imprimer.' });
  }

  const ids = lignes.map((l) => Number(l.articleId));
  const articles = await prisma.article.findMany({ where: { id: { in: ids } } });
  const parId = Object.fromEntries(articles.map((a) => [a.id, a]));

  const blocsEtiquettes = [];
  const articlesIgnores = [];
  const tronquer = (texte, max) => (texte.length > max ? `${texte.slice(0, max - 3).trimEnd()}...` : texte);
  for (const ligne of lignes) {
    const article = parId[Number(ligne.articleId)];
    if (!article) continue;
    const quantite = Math.max(1, Number(ligne.quantite) || 1);

    // Un code-barre mal formé (hérité d'un import, pas exactement 13 chiffres)
    // ne doit jamais faire planter l'impression de tout le lot — on imprime
    // l'étiquette sans le visuel code-barre dans ce cas, et on le signale.
    let svgCodeBarre = '';
    if (article.codeBarre) {
      try {
        svgCodeBarre = genererSvgEAN13(article.codeBarre);
      } catch {
        svgCodeBarre = '';
        if (!articlesIgnores.includes(article.reference)) articlesIgnores.push(article.reference);
      }
    }

    for (let i = 0; i < quantite; i++) {
      blocsEtiquettes.push(`
        <div class="etiquette">
          <div class="designation">${tronquer(article.designation, 14)}</div>
          <div class="prix">${Number(article.prixVente).toLocaleString('fr-FR')} F</div>
          ${svgCodeBarre}
          ${article.codeBarre ? `<div class="code">${article.codeBarre}</div>` : ''}
          <div class="reference">${article.reference}</div>
        </div>
      `);
    }
  }

  await prisma.article.updateMany({
    where: { id: { in: ids } },
    data: { quantiteAImprimer: 0 },
  });

  const html = construireHtmlEtiquettes(blocsEtiquettes.join('\n'), articlesIgnores);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

function construireHtmlEtiquettes(contenu, articlesIgnores = []) {
  const messageAlerte = articlesIgnores.length > 0
    ? `alert(${JSON.stringify(`⚠️ Code-barre invalide, imprimé sans visuel code-barre pour : ${articlesIgnores.join(', ')}\\nPense à régénérer leur code-barre depuis la fiche article.`)});`
    : '';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Étiquettes à imprimer - Archange Bébé</title>
<style>
  @page { size: 40mm 25mm; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; margin: 0; }
  .etiquette {
    width: 40mm; height: 25mm; padding: 0.8mm 0.8mm;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; overflow: hidden;
    page-break-inside: avoid; break-inside: avoid;
  }
  .etiquette:not(:last-child) { page-break-after: always; break-after: page; }
  .designation {
    width: 100%; font-size: 12px; font-weight: bold; margin-top: 0.6mm;
    white-space: nowrap; overflow: hidden; text-overflow: clip;
  }
  .prix { width: 100%; font-size: 13.5px; font-weight: bold; margin-top: 0.6mm; }
  .etiquette svg { width: 38mm; height: 9mm; margin-top: 0.6mm; }
  .code { font-size: 9px; letter-spacing: 0.3px; margin-top: 0.3mm; }
  .reference { font-size: 10.5px; font-weight: bold; letter-spacing: 0.4px; margin-top: 0.4mm; font-family: 'Courier New', monospace; }
</style>
</head>
<body>
  ${contenu || '<p>Aucune étiquette en attente.</p>'}
  <script>${messageAlerte} window.print();</script>
</body>
</html>`;
}

// POST /api/articles/:id/photo
// Ajoute une photo à la galerie de l'article (n'écrase plus les photos existantes).
// La toute première photo ajoutée devient automatiquement la photo principale.
async function uploaderPhoto(req, res) {
  const id = Number(req.params.id);
  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) return res.status(404).json({ error: 'Article introuvable.' });

  if (!req.file) {
    return res.status(400).json({ error: 'Aucune image reçue.' });
  }

  try {
    const resultat = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'archange-bebe/articles', resource_type: 'image' },
        (error, result) => (error ? reject(error) : resolve(result)),
      );
      stream.end(req.file.buffer);
    });

    const nombrePhotosExistantes = await prisma.photoArticle.count({ where: { articleId: id } });
    const estPremierePhoto = nombrePhotosExistantes === 0;

    await prisma.photoArticle.create({
      data: {
        articleId: id,
        url: resultat.secure_url,
        ordre: nombrePhotosExistantes,
        estPrincipale: estPremierePhoto,
        ajouteParId: req.user.id,
      },
    });
    // Tracé dans le journal (reste visible au rapport d'activité même si la photo est
    // supprimée plus tard).
    await enregistrerActivite(prisma, {
      type: 'AJOUT_PHOTO_ARTICLE',
      description: `Photo ajoutée sur ${article.designation} (${article.reference})${estPremierePhoto ? ' — photo principale' : ''}`,
      utilisateurId: req.user.id,
    });

    // Article.photoUrl reste synchronisé sur la photo principale (compatibilité
    // avec les écrans/le site qui lisent encore ce champ directement).
    const misAJour = await prisma.article.update({
      where: { id },
      data: estPremierePhoto ? { photoUrl: resultat.secure_url } : {},
      include: { photos: { orderBy: { ordre: 'asc' } } },
    });

    res.json(misAJour);
  } catch (err) {
    res.status(500).json({ error: "Échec de l'upload de la photo." });
  }
}

// DELETE /api/articles/:id/photos/:photoId
// Supprime une photo de la galerie. Si c'était la photo principale, la photo
// suivante (par ordre) est promue automatiquement — sinon photoUrl repasse à null.
async function supprimerPhoto(req, res) {
  const id = Number(req.params.id);
  const photoId = Number(req.params.photoId);

  const photo = await prisma.photoArticle.findUnique({ where: { id: photoId } });
  if (!photo || photo.articleId !== id) {
    return res.status(404).json({ error: 'Photo introuvable pour cet article.' });
  }

  await prisma.photoArticle.delete({ where: { id: photoId } });

  let article;
  if (photo.estPrincipale) {
    const suivante = await prisma.photoArticle.findFirst({
      where: { articleId: id },
      orderBy: { ordre: 'asc' },
    });
    if (suivante) {
      await prisma.photoArticle.update({ where: { id: suivante.id }, data: { estPrincipale: true } });
    }
    article = await prisma.article.update({
      where: { id },
      data: { photoUrl: suivante ? suivante.url : null },
      include: { photos: { orderBy: { ordre: 'asc' } } },
    });
  } else {
    article = await prisma.article.findUnique({
      where: { id },
      include: { photos: { orderBy: { ordre: 'asc' } } },
    });
  }

  res.json(article);
}

// PUT /api/articles/:id/photos/:photoId/principale
// Définit une photo existante comme photo principale (vignette listes + catalogue).
async function definirPhotoPrincipale(req, res) {
  const id = Number(req.params.id);
  const photoId = Number(req.params.photoId);

  const photo = await prisma.photoArticle.findUnique({ where: { id: photoId } });
  if (!photo || photo.articleId !== id) {
    return res.status(404).json({ error: 'Photo introuvable pour cet article.' });
  }

  await prisma.photoArticle.updateMany({ where: { articleId: id }, data: { estPrincipale: false } });
  await prisma.photoArticle.update({ where: { id: photoId }, data: { estPrincipale: true } });

  const article = await prisma.article.update({
    where: { id },
    data: { photoUrl: photo.url },
    include: { photos: { orderBy: { ordre: 'asc' } } },
  });

  res.json(article);
}

// PUT /api/articles/deplacer-groupe   { articleIds: [1,2,3], sousFamilleId }
// Déplace plusieurs articles d'un coup vers une autre sous-famille (et sa famille,
// automatiquement) — pour corriger un mauvais classement sans rouvrir chaque article.
async function deplacerGroupe(req, res) {
  const { articleIds, sousFamilleId } = req.body;
  if (!Array.isArray(articleIds) || articleIds.length === 0 || !sousFamilleId) {
    return res.status(400).json({ error: 'articleIds (au moins un) et sousFamilleId sont requis.' });
  }

  const sousFamille = await prisma.sousFamille.findUnique({ where: { id: Number(sousFamilleId) } });
  if (!sousFamille) return res.status(404).json({ error: 'Sous-famille introuvable.' });

  const resultat = await prisma.article.updateMany({
    where: { id: { in: articleIds.map(Number) } },
    data: { sousFamilleId: sousFamille.id, familleId: sousFamille.familleId },
  });

  res.json({ deplaces: resultat.count });
}

// GET /api/articles/:id/stock
// Stock de cet article, réparti par lieu (boutiques + entrepôts), pour l'afficher
// sans changer de page (ex: directement dans la fiche de modification).
async function stockParDepot(req, res) {
  const id = Number(req.params.id);
  const stocks = await prisma.stockEmplacement.findMany({
    where: { articleId: id },
    include: { lieu: true },
    orderBy: { lieu: { nom: 'asc' } },
  });
  res.json(stocks.map((s) => ({ lieuId: s.lieuId, lieuNom: s.lieu.nom, quantite: s.quantite })));
}

module.exports = {
  listerArticles,
  rechercherArticle,
  creerArticle,
  modifierArticle,
  genererCodeBarre,
  listerCodesAImprimer,
  imprimerEtiquettes,
  uploaderPhoto,
  supprimerPhoto,
  definirPhotoPrincipale,
  deplacerGroupe,
  stockParDepot,
};
