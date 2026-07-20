const prisma = require('../lib/prisma');

// GET /api/journal?type=&dateDebut=&dateFin=
async function listerJournal(req, res) {
  const { type, dateDebut, dateFin } = req.query;
  const where = {};
  if (type) where.type = type;
  if (dateDebut || dateFin) {
    where.createdAt = {};
    if (dateDebut) {
      const d = new Date(dateDebut);
      d.setHours(0, 0, 0, 0);
      where.createdAt.gte = d;
    }
    if (dateFin) {
      const d = new Date(dateFin);
      d.setHours(23, 59, 59, 999);
      where.createdAt.lte = d;
    }
  }

  const entrees = await prisma.journalActivite.findMany({
    where,
    include: { utilisateur: true },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  res.json(entrees);
}

module.exports = { listerJournal };
