// Intégration JEKO (paiement en ligne — Wave, Orange Money, MTN, carte...)
// Doc : https://developer.jeko.africa
//
// Variables d'environnement requises :
//   JEKO_API_KEY        — clé API (Jeko Cockpit > Paramètres > API & Webhooks)
//   JEKO_API_KEY_ID      — identifiant de la clé API
//   JEKO_STORE_ID        — identifiant du magasin JEKO (GET /partner_api/stores)
//   JEKO_WEBHOOK_SECRET  — secret webhook, pour vérifier l'authenticité des notifications

const crypto = require('crypto');

const BASE_URL = process.env.JEKO_BASE_URL || 'https://api.jeko.africa';

function estConfigure() {
  return Boolean(process.env.JEKO_API_KEY && process.env.JEKO_API_KEY_ID && process.env.JEKO_STORE_ID);
}

function headersAuth() {
  return {
    'X-API-KEY': process.env.JEKO_API_KEY,
    'X-API-KEY-ID': process.env.JEKO_API_KEY_ID,
    'Content-Type': 'application/json',
  };
}

// Crée un lien de paiement à usage unique pour une commande.
// montantXof : montant en francs CFA (entier) — JEKO attend des "centimes"
// (montant × 100) même pour une devise sans sous-unité comme le XOF.
async function creerLienPaiement({ titre, montantXof, reference }) {
  if (!estConfigure()) {
    throw new Error('Le paiement en ligne JEKO n\'est pas encore configuré.');
  }

  const reponse = await fetch(`${BASE_URL}/partner_api/payment_links`, {
    method: 'POST',
    headers: headersAuth(),
    body: JSON.stringify({
      storeId: process.env.JEKO_STORE_ID,
      title: titre.slice(0, 255),
      amountCents: Math.round(montantXof) * 100,
      currency: 'XOF',
      allowMultiplePayments: false,
      reference,
    }),
  });

  const data = await reponse.json().catch(() => ({}));
  if (!reponse.ok) {
    throw new Error(data.message || 'Échec de la création du lien de paiement JEKO.');
  }
  return data; // { id, link, canReceivePayments, ... }
}

// Vérifie la signature HMAC-SHA256 d'une notification webhook JEKO.
// rawBody doit être le corps BRUT de la requête (Buffer), pas le JSON parsé —
// toute transformation du corps invaliderait la comparaison de signature.
function verifierSignatureWebhook(rawBody, signatureRecue) {
  if (!signatureRecue || !process.env.JEKO_WEBHOOK_SECRET) return false;
  const signatureAttendue = crypto
    .createHmac('sha256', process.env.JEKO_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureAttendue), Buffer.from(signatureRecue));
  } catch {
    return false; // longueurs différentes ou signature malformée
  }
}

module.exports = { estConfigure, creerLienPaiement, verifierSignatureWebhook };
