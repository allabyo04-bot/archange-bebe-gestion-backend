const prisma = require('../lib/prisma');
const jeko = require('../lib/jeko');

// POST /api/webhooks/jeko
// req.body est ici un Buffer BRUT (voir server.js — express.raw sur cette route,
// avant express.json global), nécessaire pour que la vérification de signature
// HMAC porte exactement sur les octets envoyés par JEKO.
async function recevoirWebhookJeko(req, res) {
  const signature = req.headers['jeko-signature'];
  if (!jeko.verifierSignatureWebhook(req.body, signature)) {
    return res.status(401).json({ error: 'Signature invalide.' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Corps de requête invalide.' });
  }

  // Réponse immédiate — JEKO attend un 200 sous 5 secondes, le traitement lui-même
  // est rapide (une seule mise à jour en base) donc pas besoin de file d'attente ici.
  res.status(200).json({ received: true });

  try {
    const data = payload.data || payload; // tolère les deux formats de payload
    if (data.transactionType === 'payment' && data.status === 'success') {
      const reference = data.transactionDetails?.reference;
      if (reference) {
        await prisma.commandeEnLigne.updateMany({
          where: { numero: reference, paiementRecu: false },
          data: { paiementRecu: true },
        });
      }
    }
  } catch (err) {
    // La réponse HTTP est déjà partie ; on journalise seulement pour investigation —
    // si besoin, la commande peut être marquée payée manuellement depuis l'admin.
    console.error('Erreur traitement webhook JEKO :', err);
  }
}

module.exports = { recevoirWebhookJeko };
