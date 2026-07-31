const cloudinary = require('../../config/cloudinary');
const prisma = require('../lib/prisma');
const { genererCodeBarreInterne } = require('../utils/barcode');
const { genererSvgEAN13 } = require('../utils/ean13');
const { enregistrerActivite } = require('../lib/journal');

// GET /api/articles?familleId=&sousFamilleId=&enStock=true
async function listerArticles(req, res) {
  const { familleId, sousFamilleId, enStock } = req.query;

  const where = { actif: true };
  if (familleId) where.familleId = Number(familleId);
  if (sousFamilleId) where.sousFamilleId = Number(sousFamilleId);
  if (enStock === 'true') where.stockActuel = { gt: 0 };

  const articles = await prisma.article.findMany({
    where,
    include: { famille: true, sousFamille: true },
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

  let article = await prisma.article.findFirst({ where: { codeBarre: q, actif: true } });
  if (!article) {
    article = await prisma.article.findFirst({ where: { codeInterne: q, actif: true } });
  }
  if (!article) {
    article = await prisma.article.findFirst({ where: { reference: { equals: q, mode: 'insensitive' }, actif: true } });
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
    familleId, sousFamilleId, prixAchat, prixVente, seuilAlerte,
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
          designation,
          familleId: Number(familleId),
          sousFamilleId: Number(sousFamilleId),
          prixAchat: prixAchat || 0,
          prixVente,
          seuilAlerte: seuilAlerte ?? 5,
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
  const {
    designation, familleId, sousFamilleId,
    prixAchat, prixVente, seuilAlerte, actif,
  } = req.body;

  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) return res.status(404).json({ error: 'Article introuvable.' });

  if (!designation || !familleId || !sousFamilleId || prixVente === undefined) {
    return res.status(400).json({ error: 'Désignation, famille, sous-famille et prix de vente sont requis.' });
  }

  const nouveauPrixAchat = prixAchat !== undefined ? prixAchat : article.prixAchat;

  const misAJour = await prisma.article.update({
    where: { id },
    data: {
      designation,
      familleId: Number(familleId),
      sousFamilleId: Number(sousFamilleId),
      prixAchat: nouveauPrixAchat,
      prixVente,
      seuilAlerte: seuilAlerte ?? article.seuilAlerte,
      actif: actif !== undefined ? actif : article.actif,
    },
  });

  const prixAchatAvant = Number(article.prixAchat);
  const prixVenteAvant = Number(article.prixVente);
  const prixAchatApres = Number(misAJour.prixAchat);
  const prixVenteApres = Number(misAJour.prixVente);

  if (prixAchatAvant !== prixAchatApres || prixVenteAvant !== prixVenteApres) {
    const parties = [];
    if (prixAchatAvant !== prixAchatApres) {
      parties.push(`prix d'achat ${prixAchatAvant.toLocaleString('fr-FR')} F → ${prixAchatApres.toLocaleString('fr-FR')} F`);
    }
    if (prixVenteAvant !== prixVenteApres) {
      parties.push(`prix de vente ${prixVenteAvant.toLocaleString('fr-FR')} F → ${prixVenteApres.toLocaleString('fr-FR')} F`);
    }
    await enregistrerActivite(prisma, {
      type: 'MODIFICATION_PRIX_ARTICLE',
      description: `${article.designation} (${article.reference}) — ${parties.join(', ')}`,
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
      quantiteAImprimer: article.quantiteAImprimer > 0 ? article.quantiteAImprimer : 1,
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
  const tronquer = (texte, max) => (texte.length > max ? `${texte.slice(0, max - 1).trimEnd()}…` : texte);
  for (const ligne of lignes) {
    const article = parId[Number(ligne.articleId)];
    if (!article) continue;
    const quantite = Math.max(1, Number(ligne.quantite) || 1);
    for (let i = 0; i < quantite; i++) {
      blocsEtiquettes.push(`
        <div class="etiquette">
          <div class="marque">Archange Bébé</div>
          <div class="designation">${tronquer(article.designation, 17)}</div>
          <div class="prix">${Number(article.prixVente).toLocaleString('fr-FR')} F</div>
          ${article.codeBarre ? genererSvgEAN13(article.codeBarre) : ''}
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

  const html = construireHtmlEtiquettes(blocsEtiquettes.join('\n'));
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

function construireHtmlEtiquettes(contenu) {
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
    width: 40mm; height: 25mm; padding: 1mm 1.5mm;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; overflow: hidden;
    page-break-inside: avoid; break-inside: avoid;
  }
  .etiquette:not(:last-child) { page-break-after: always; break-after: page; }
  .marque { width: 100%; font-size: 7px; font-weight: bold; letter-spacing: 0.3px; color: #2E4E9E; text-transform: uppercase; line-height: 1.1; }
  .designation {
    width: 100%; font-size: 10.5px; font-weight: bold; margin-top: 0.6mm;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .prix { width: 100%; font-size: 12px; font-weight: bold; margin-top: 0.6mm; }
  .etiquette svg { width: 35mm; height: 8mm; margin-top: 0.6mm; }
  .code { font-size: 8px; letter-spacing: 0.3px; margin-top: 0.3mm; }
  .reference { font-size: 9.5px; font-weight: bold; letter-spacing: 0.4px; margin-top: 0.4mm; font-family: 'Courier New', monospace; }
</style>
</head>
<body>
  ${contenu || '<p>Aucune étiquette en attente.</p>'}
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
}

// POST /api/articles/:id/photo
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

    const misAJour = await prisma.article.update({
      where: { id },
      data: { photoUrl: resultat.secure_url },
    });

    res.json(misAJour);
  } catch (err) {
    res.status(500).json({ error: "Échec de l'upload de la photo." });
  }
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
  deplacerGroupe,
  stockParDepot,
};
