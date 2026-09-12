const prisma = require('../lib/prisma');

// GET /api/utilisateurs/:id/rapport-activite?dateDebut=&dateFin=   (ADMIN uniquement)
// Rapport complet de ce qu'un utilisateur a fait sur la période — pensé pour
// suivre un profil aux droits limités (ex. "Gestionnaire de stock" qui ne peut
// que créer des articles, faire des réceptions et des inventaires), mais
// fonctionne pour n'importe quel utilisateur.
async function rapportActivite(req, res) {
  const utilisateurId = Number(req.params.id);
  const { dateDebut, dateFin } = req.query;

  const utilisateur = await prisma.utilisateur.findUnique({ where: { id: utilisateurId } });
  if (!utilisateur) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  const periode = {};
  if (dateDebut) {
    const d = new Date(dateDebut);
    d.setHours(0, 0, 0, 0);
    periode.gte = d;
  }
  if (dateFin) {
    const d = new Date(dateFin);
    d.setHours(23, 59, 59, 999);
    periode.lte = d;
  }
  const whereDate = Object.keys(periode).length > 0 ? periode : undefined;

  const [articlesCrees, modificationsPrix, receptions, corrections, transferts] = await Promise.all([
    prisma.article.findMany({
      where: { creeParId: utilisateurId, ...(whereDate ? { createdAt: whereDate } : {}) },
      select: { id: true, reference: true, designation: true, prixVente: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.journalActivite.findMany({
      where: { utilisateurId, type: 'MODIFICATION_PRIX_ARTICLE', ...(whereDate ? { createdAt: whereDate } : {}) },
      select: { description: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.reception.findMany({
      where: { utilisateurId, ...(whereDate ? { createdAt: whereDate } : {}) },
      include: { lieu: { select: { nom: true } }, lignes: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.mouvementStock.findMany({
      where: { utilisateurId, type: 'CORRECTION_INVENTAIRE', ...(whereDate ? { createdAt: whereDate } : {}) },
      include: { article: { select: { reference: true, designation: true } }, lieu: { select: { nom: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.mouvementStock.findMany({
      where: { utilisateurId, type: { in: ['TRANSFERT_SORTIE', 'TRANSFERT_ENTREE'] }, ...(whereDate ? { createdAt: whereDate } : {}) },
      include: { article: { select: { reference: true, designation: true } }, lieu: { select: { nom: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  res.json({
    utilisateur: { id: utilisateur.id, nomComplet: utilisateur.nomComplet, nomUtilisateur: utilisateur.nomUtilisateur },
    periode: { dateDebut: dateDebut || null, dateFin: dateFin || null },
    resume: {
      nbArticlesCrees: articlesCrees.length,
      nbPrixModifies: modificationsPrix.length,
      nbReceptions: receptions.length,
      nbLignesReceptionnees: receptions.reduce((s, r) => s + r.lignes.length, 0),
      quantiteTotaleReceptionnee: receptions.reduce((s, r) => s + r.lignes.reduce((s2, l) => s2 + l.quantite, 0), 0),
      nbCorrectionsInventaire: corrections.length,
      nbTransferts: transferts.length,
    },
    detail: {
      articlesCrees,
      modificationsPrix,
      receptions: receptions.map((r) => ({
        id: r.id, date: r.createdAt, lieu: r.lieu?.nom, fournisseur: r.fournisseur,
        nbLignes: r.lignes.length, quantiteTotale: r.lignes.reduce((s, l) => s + l.quantite, 0),
      })),
      correctionsInventaire: corrections.map((c) => ({
        date: c.createdAt, article: c.article?.designation, reference: c.article?.reference,
        lieu: c.lieu?.nom, ecart: c.quantite, notes: c.notes,
      })),
      transferts: transferts.map((t) => ({
        date: t.createdAt, article: t.article?.designation, reference: t.article?.reference,
        lieu: t.lieu?.nom, sens: t.type === 'TRANSFERT_SORTIE' ? 'Sortie' : 'Entrée', quantite: t.quantite,
      })),
    },
  });
}

module.exports = { rapportActivite };
