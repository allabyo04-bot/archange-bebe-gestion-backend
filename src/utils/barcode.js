// Génère des codes-barres EAN-13 internes pour les articles qui n'en ont pas.
// Préfixe "20" (plage réservée à l'usage interne/magasin dans la norme EAN),
// suivi de l'id article sur 10 chiffres, puis une clé de contrôle calculée.

function calculerCleControleEAN13(douzeChiffres) {
  const chiffres = douzeChiffres.split('').map(Number);
  let somme = 0;
  chiffres.forEach((chiffre, index) => {
    somme += index % 2 === 0 ? chiffre : chiffre * 3;
  });
  const reste = somme % 10;
  return reste === 0 ? 0 : 10 - reste;
}

function genererCodeBarreInterne(articleId) {
  const corps = `20${String(articleId).padStart(10, '0')}`; // 12 chiffres
  const cle = calculerCleControleEAN13(corps);
  return `${corps}${cle}`; // 13 chiffres
}

module.exports = { genererCodeBarreInterne };
