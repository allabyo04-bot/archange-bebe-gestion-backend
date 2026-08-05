// Récupère la liste des magasins JEKO associés à ton compte entreprise, avec leur
// storeId — à lancer une seule fois pour trouver la valeur de JEKO_STORE_ID.
//
// Usage : node src/scripts/listerMagasinsJeko.js

require('dotenv').config();

async function main() {
  const { JEKO_API_KEY, JEKO_API_KEY_ID } = process.env;
  if (!JEKO_API_KEY || !JEKO_API_KEY_ID) {
    console.error('JEKO_API_KEY et/ou JEKO_API_KEY_ID manquants dans le .env local.');
    console.error('Ajoute-les temporairement dans backend/.env (mêmes valeurs que sur Railway) pour lancer ce script.');
    process.exitCode = 1;
    return;
  }

  const reponse = await fetch('https://api.jeko.africa/partner_api/stores', {
    headers: {
      'X-API-KEY': JEKO_API_KEY,
      'X-API-KEY-ID': JEKO_API_KEY_ID,
    },
  });

  const texte = await reponse.text();
  let data;
  try { data = JSON.parse(texte); } catch { data = texte; }

  if (!reponse.ok) {
    console.error(`Erreur ${reponse.status} :`, data);
    process.exitCode = 1;
    return;
  }

  const magasins = Array.isArray(data) ? data : (data.stores || data.data || []);
  if (!magasins.length) {
    console.log("Aucun magasin trouvé pour ce compte. Réponse brute reçue :");
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(`${magasins.length} magasin(s) trouvé(s) :\n`);
  for (const m of magasins) {
    console.log(`Nom : ${m.name || m.storeName || '(sans nom)'}`);
    console.log(`storeId : ${m.id || m.storeId}`);
    console.log('---');
  }
  console.log('\nCopie le storeId du magasin "Archange Bébé" dans JEKO_STORE_ID sur Railway.');
}

main().catch((err) => {
  console.error('Erreur :', err.message);
  process.exitCode = 1;
});
