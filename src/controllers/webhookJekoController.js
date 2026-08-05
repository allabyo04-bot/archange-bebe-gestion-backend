const prisma = require('../lib/prisma');
const jeko = require('../lib/jeko');

// POST /api/webhooks/jeko
// req.body est ici un Buffer BRUT (voir server.js — express.raw sur cette route,
// avant express.json global), nécessaire pour que la vérification de signature
// HMAC porte exactement sur les octets envoyés par JEKO.
async function recevoirWebhookJeko(req, res) {
  const signature = req.headers['jeko-signature'];
  console.log(`Webhook JEKO reçu — signature présente : ${!!signature}, taille du corps : ${req.body?.length || 0} octets`);

  if (!jeko.verifierSignatureWebhook(req.body, signature)) {
    console.error('Webhook JEKO : signature invalide ou secret manquant — vérifier JEKO_WEBHOOK_SECRET.');
    return res.status(401).json({ error: 'Signature invalide.' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    console.error('Webhook JEKO : corps de requête non JSON.');
    return res.status(400).json({ error: 'Corps de requête invalide.' });
  }

  // Réponse immédiate — JEKO attend un 200 sous 5 secondes, le traitement lui-même
  // est rapide (une seule mise à jour en base) donc pas besoin de file d'attente ici.
  res.status(200).json({ received: true });

  try {
    const data = payload.data || payload; // tolère les deux formats de payload
    console.log(`Webhook JEKO : transactionType=${data.transactionType}, status=${data.status}, paymentLinkId=${data.transactionDetails?.paymentLinkId}`);
    if (data.transactionType === 'payment' && data.status === 'success') {
      // L'API "payment_links" ne renvoie pas de référence personnalisée : le rapprochement
      // se fait via l'identifiant du lien de paiement lui-même (stocké sur la commande à
      // sa création, voir boutiqueController.creerCommande).
      const paymentLinkId = data.transactionDetails?.paymentLinkId;
      if (paymentLinkId) {
        const resultat = await prisma.commandeEnLigne.updateMany({
          where: { jekoPaymentLinkId: paymentLinkId, paiementRecu: false },
          data: { paiementRecu: true },
        });
        console.log(`Webhook JEKO : ${resultat.count} commande(s) marquée(s) payée(s) pour paymentLinkId=${paymentLinkId}`);
      }
    }
  } catch (err) {
    // La réponse HTTP est déjà partie ; on journalise seulement pour investigation —
    // si besoin, la commande peut être marquée payée manuellement depuis l'admin.
    console.error('Erreur traitement webhook JEKO :', err);
  }
}

module.exports = { recevoirWebhookJeko };
