const XLSX = require('xlsx');
const prisma = require('../lib/prisma');
const { appliquerMouvementStock } = require('../lib/stock');

// Colonnes attendues dans le fichier Excel :
// Référence | CodeBarre (optionnel) | Désignation | Quantité | PrixAchat | PrixVente (optionnel si article existant)

// POST /api/stock/import/previsualiser   (multipart, champ "fichier")
// Ne modifie rien en base : lit le fichier, tente de faire correspondre chaque ligne à un
// article existant (par référence ou code-barres), et renvoie un aperçu pour validation.
async function previsualiserImport(req, res) {
  if (!req.file) return res.status(400).json({ error: 'Fichier Excel requis (champ "fichier").' });

  try {
    const classeur = XLSX.read(req.file.buffer, { type: 'buffer' });
    const feuille = classeur.Sheets[classeur.SheetNames[0]];
    const lignesBrutes = XLSX.utils.sheet_to_json(feuille, { defval: null });

    const apercu = [];
    for (const ligne of lignesBrutes) {
      const reference = String(ligne['Référence'] || ligne['Reference'] || '').trim();
      const codeBarre = ligne['CodeBarre'] ? String(ligne['CodeBarre']).trim() : null;
      const designation = String(ligne['Désignation'] || ligne['Designation'] || '').trim();
      const quantite = Number(ligne['Quantité'] || ligne['Quantite'] || 0);
      const prixAchat = Number(ligne['PrixAchat'] || 0);
      const prixVente = ligne['PrixVente'] ? Number(ligne['PrixVente']) : null;

      if (!reference || !quantite) {
        apercu.push({ ligne, statut: 'ERREUR', erreur: 'Référence ou quantité manquante.' });
        continue;
      }

      const articleExistant = await prisma.article.findUnique({ where: { reference } });

      apercu.push({
        reference, codeBarre, designation, quantite, prixAchat, prixVente,
        statut: articleExistant ? 'ARTICLE_EXISTANT' : 'NOUVEL_ARTICLE',
        articleId: articleExistant ? articleExistant.id : null,
      });
    }

    res.json({ nombreLignes: apercu.length, lignes: apercu });
  } catch (err) {
    res.status(400).json({ error: `Fichier Excel illisible : ${err.message}` });
  }
}

// POST /api/stock/import/confirmer
// body: { lieuId, fournisseur?, lignes: [{ reference, codeBarre?, designation, quantite, prixAchat, prixVente?, articleId? }] }
// Crée les articles manquants, puis une Reception qui applique les mouvements de stock.
async function confirmerImport(req, res) {
  const { lieuId, fournisseur, lignes } = req.body;
  const utilisateurId = req.user.id;

  if (!lieuId || !Array.isArray(lignes) || lignes.length === 0) {
    return res.status(400).json({ error: 'Lieu et au moins une ligne sont requis.' });
  }

  try {
    const reception = await prisma.$transaction(async (tx) => {
      const lignesReception = [];

      for (const l of lignes) {
        let articleId = l.articleId;

        if (!articleId) {
          if (!l.designation || !l.prixVente) {
            throw new Error(`Désignation et prix de vente requis pour créer l'article "${l.reference}".`);
          }
          const nouvelArticle = await tx.article.create({
            data: {
              reference: l.reference,
              codeBarre: l.codeBarre || null,
              designation: l.designation,
              prixAchat: l.prixAchat || 0,
              prixVente: l.prixVente,
            },
          });
          articleId = nouvelArticle.id;
        } else {
          await tx.article.update({ where: { id: articleId }, data: { prixAchat: l.prixAchat } });
        }

        lignesReception.push({ articleId, quantite: Number(l.quantite), prixAchat: l.prixAchat });
      }

      const rec = await tx.reception.create({
        data: {
          fournisseur: fournisseur || null,
          reference: `Import Excel ${new Date().toISOString().slice(0, 10)}`,
          lieuId: Number(lieuId),
          lignes: { create: lignesReception },
        },
        include: { lignes: true },
      });

      for (const ligne of rec.lignes) {
        await appliquerMouvementStock(tx, {
          articleId: ligne.articleId,
          lieuId: Number(lieuId),
          delta: ligne.quantite,
          type: 'ENTREE_RECEPTION',
          utilisateurId,
          notes: `Import Excel - ${rec.reference}`,
        });
      }

      return rec;
    }, { maxWait: 10000, timeout: 20000 });

    res.status(201).json(reception);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = { previsualiserImport, confirmerImport };
