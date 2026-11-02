// Deux informations commerciales sensibles sont retirées des réponses JSON côté serveur,
// pour qu'elles n'arrivent même pas au navigateur de ceux qui n'y ont pas droit :
//
//   - « prixAchat » (donc la marge) : visible des administrateurs connectés seulement.
//   - « prixGros » : visible des administrateurs, des comptes ayant le droit « Vente en
//     gros », et du module Articles (qui le renseigne). Jamais d'un visiteur du site
//     e-commerce public, ni d'un caissier sans ce droit.
//
// Ce middleware enveloppe res.json : les clés interdites sont retirées à n'importe quelle
// profondeur (article, lignes de réception, mouvements, etc.).
//
// req.user n'est renseigné qu'ensuite par requireAuth (au niveau de chaque route) : on le
// lit donc au moment de l'envoi de la réponse, pas à l'entrée du middleware.
//
// Exception ponctuelle : un contrôleur peut poser res.locals.garderPrixAchat = true
// (ex. aperçu d'import Excel, où les prix viennent du fichier de l'utilisateur lui-même).

function retirerCles(valeur, cles) {
  if (Array.isArray(valeur)) return valeur.map((v) => retirerCles(v, cles));
  if (valeur && typeof valeur === 'object') {
    const proto = Object.getPrototypeOf(valeur);
    // On ne descend que dans les objets « simples » : pas dans les Date, Decimal Prisma, etc.
    if (proto !== Object.prototype && proto !== null) return valeur;
    const copie = {};
    for (const [cle, v] of Object.entries(valeur)) {
      if (cles.includes(cle)) continue;
      copie[cle] = retirerCles(v, cles);
    }
    return copie;
  }
  return valeur;
}

function retirerPrixAchat(valeur) {
  return retirerCles(valeur, ['prixAchat']);
}

function peutVoirPrixGros(user) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const permissions = user.permissions || [];
  return permissions.includes('VENTE_GROS') || permissions.includes('ARTICLES');
}

function masquerPrixAchat(req, res, next) {
  const jsonOriginal = res.json.bind(res);
  res.json = (corps) => {
    const aRetirer = [];
    if (req.user?.role !== 'ADMIN' && !res.locals.garderPrixAchat) aRetirer.push('prixAchat');
    if (!peutVoirPrixGros(req.user)) aRetirer.push('prixGros');
    return jsonOriginal(aRetirer.length > 0 ? retirerCles(corps, aRetirer) : corps);
  };
  next();
}

module.exports = { masquerPrixAchat, retirerPrixAchat, peutVoirPrixGros };
