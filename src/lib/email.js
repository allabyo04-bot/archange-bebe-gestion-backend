// Envoi d'emails transactionnels via Resend — réutilise la même clé API que la
// sauvegarde quotidienne (BACKUP_RESEND_API_KEY), pas besoin d'un compte séparé.
//
// L'adresse d'expédition "onboarding@resend.dev" est l'adresse de test fournie par
// Resend : elle fonctionne sans configuration DNS supplémentaire, mais affiche encore
// la marque Resend au destinataire. Pour un envoi depuis "commandes@archangebebe.com",
// il faudrait vérifier le domaine sur Resend (ajout d'enregistrements DNS chez OVH,
// même principe que ce qu'on a fait pour le site) — à faire plus tard si souhaité.

function estConfigure() {
  return Boolean(process.env.BACKUP_RESEND_API_KEY);
}

async function envoyer({ to, subject, html, text }) {
  if (!estConfigure()) {
    throw new Error('Envoi d\'email non configuré (BACKUP_RESEND_API_KEY manquant).');
  }
  const reponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.BACKUP_RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Archange Bébé <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
      text,
    }),
  });
  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new Error(`Échec de l'envoi d'email (${reponse.status}) : ${texte}`);
  }
}

// Envoie l'email de confirmation d'une commande passée sur le site.
async function envoyerConfirmationCommande(commande) {
  if (!commande.emailClient) return; // pas d'email fourni, rien à envoyer

  const lignesHtml = commande.lignes.map((l) => `
    <tr>
      <td style="padding:6px 0;">${l.designation} × ${l.quantite}</td>
      <td style="padding:6px 0; text-align:right;">${(Number(l.prixUnitaire) * l.quantite).toLocaleString('fr-FR')} F</td>
    </tr>
  `).join('');

  const modeTexte = commande.modeLivraison === 'RETRAIT' ? 'Retrait en boutique' : `Livraison — ${commande.villeLivraison}`;
  const paiementTexte = commande.modePaiement === 'JEKO' ? 'Paiement en ligne' : 'Paiement à la récupération';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1F2E45;">
      <h1 style="font-size: 20px;">Merci pour ta commande, ${commande.nomClient} !</h1>
      <p>Ta commande <strong>${commande.numero}</strong> a bien été enregistrée.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        ${lignesHtml}
        <tr style="border-top: 2px solid #E9EEF6; font-weight: bold;">
          <td style="padding-top:10px;">Total</td>
          <td style="padding-top:10px; text-align:right;">${Number(commande.totalCommande).toLocaleString('fr-FR')} F</td>
        </tr>
      </table>
      <p><strong>Mode :</strong> ${modeTexte}<br/>
      <strong>Paiement :</strong> ${paiementTexte}</p>
      <p style="margin-top: 24px; font-size: 13px; color: #5B6B85;">
        Une question ? Contacte-nous au 0505380826 / 2722242008.
      </p>
    </div>
  `;
  const text = `Merci pour ta commande, ${commande.nomClient} !\n\nCommande ${commande.numero}\nTotal : ${Number(commande.totalCommande).toLocaleString('fr-FR')} F\n${modeTexte}\n${paiementTexte}\n\nUne question ? 0505380826 / 2722242008.`;

  await envoyer({
    to: commande.emailClient,
    subject: `Confirmation de ta commande ${commande.numero} — Archange Bébé`,
    html,
    text,
  });
}

module.exports = { estConfigure, envoyerConfirmationCommande };
