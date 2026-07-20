// Applique un mouvement de stock sur un article, dans un lieu donné, à l'intérieur
// d'une transaction Prisma (tx). Met à jour StockEmplacement, le total agrégé sur
// Article.stockActuel, et trace le mouvement dans MouvementStock.
//
// delta : quantité signée (+10 pour une entrée, -3 pour une sortie)
async function appliquerMouvementStock(tx, {
  articleId, lieuId, delta, type, utilisateurId, refVenteId = null, notes = null,
}) {
  const stockEmplacement = await tx.stockEmplacement.upsert({
    where: { articleId_lieuId: { articleId, lieuId } },
    create: { articleId, lieuId, quantite: 0 },
    update: {},
  });

  const stockAvant = stockEmplacement.quantite;
  const stockApres = stockAvant + delta;

  if (stockApres < 0) {
    throw new Error(`Stock insuffisant pour l'article ${articleId} au lieu ${lieuId}.`);
  }

  await tx.stockEmplacement.update({
    where: { articleId_lieuId: { articleId, lieuId } },
    data: { quantite: stockApres },
  });

  await tx.article.update({
    where: { id: articleId },
    data: { stockActuel: { increment: delta } },
  });

  await tx.mouvementStock.create({
    data: {
      articleId, lieuId, type, quantite: delta,
      stockAvant, stockApres, utilisateurId, refVenteId, notes,
    },
  });

  return stockApres;
}

module.exports = { appliquerMouvementStock };
