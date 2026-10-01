// Le prix d'achat (donc la marge) n'est visible que des administrateurs connectés.
// Ce middleware enveloppe res.json : si la requête ne vient pas d'un administrateur
// (compte non-admin, OU visiteur / client du site e-commerce public), toute clé
// « prixAchat » est retirée de la réponse, à n'importe quelle profondeur (article,
// lignes de réception, mouvements, etc.). C'est fait côté serveur pour que l'information
// n'arrive même pas au navigateur.
//
// req.user n'est renseigné qu'ensuite par requireAuth (au niveau de chaque route) : on le
// lit donc au moment de l'envoi de la réponse, pas à l'entrée du middleware.
//
// Exception ponctuelle : un contrôleur peut poser res.locals.garderPrixAchat = true
// (ex. aperçu d'import Excel, où les prix viennent du fichier de l'utilisateur lui-même).

function retirerPrixAchat(valeur) {
  if (Array.isArray(valeur)) return valeur.map(retirerPrixAchat);
  if (valeur && typeof valeur === 'object') {
    const proto = Object.getPrototypeOf(valeur);
    // On ne descend que dans les objets « simples » : pas dans les Date, Decimal Prisma, etc.
    if (proto !== Object.prototype && proto !== null) return valeur;
    const copie = {};
    for (const [cle, v] of Object.entries(valeur)) {
      if (cle === 'prixAchat') continue;
      copie[cle] = retirerPrixAchat(v);
    }
    return copie;
  }
  return valeur;
}

function masquerPrixAchat(req, res, next) {
  const jsonOriginal = res.json.bind(res);
  res.json = (corps) => {
    if (req.user?.role !== 'ADMIN' && !res.locals.garderPrixAchat) {
      return jsonOriginal(retirerPrixAchat(corps));
    }
    return jsonOriginal(corps);
  };
  next();
}

module.exports = { masquerPrixAchat, retirerPrixAchat };
