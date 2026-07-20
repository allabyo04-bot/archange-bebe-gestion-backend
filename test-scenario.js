// Script de test du backend Jesma U — à lancer avec : node test-scenario.js
// Teste un scénario complet réaliste et affiche le résultat de chaque étape.
//
// Prérequis : le serveur doit tourner (node src/server.js dans un autre terminal).

const BASE_URL = 'http://localhost:4000/api';

let token = null;
let ligneCompteur = 0;

function ligne(titre) {
  ligneCompteur++;
  console.log(`\n[${ligneCompteur}] ${titre}`);
}

async function appel(methode, chemin, corps, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token && !options.sansAuth) headers.Authorization = `Bearer ${token}`;

  const reponse = await fetch(`${BASE_URL}${chemin}`, {
    method: methode,
    headers,
    body: corps ? JSON.stringify(corps) : undefined,
  });

  const texte = await reponse.text();
  let data;
  try { data = JSON.parse(texte); } catch { data = texte; }

  if (!reponse.ok) {
    console.log(`   ❌ ÉCHEC (${reponse.status}) :`, data);
    throw new Error(`Échec sur ${methode} ${chemin}`);
  }
  console.log(`   ✅ OK (${reponse.status})`);
  return data;
}

async function main() {
  try {
    ligne('Connexion avec victoria / 1234');
    const connexion = await appel('POST', '/auth/login', { nomUtilisateur: 'victoria', pin: '1234' }, { sansAuth: true });
    token = connexion.token;
    console.log('   Token reçu, rôle :', connexion.utilisateur.role);

    ligne('Récupération des lieux (Entrepôt / Boutique)');
    const lieux = await appel('GET', '/stock/lieux');
    const entrepot = lieux.find((l) => l.type === 'ENTREPOT');
    const boutique = lieux.find((l) => l.type === 'BOUTIQUE');
    console.log('   Entrepôt id:', entrepot.id, '| Boutique id:', boutique.id);

    ligne('Création d\'une famille + sous-famille');
    const suffixe = Date.now();
    const famille = await appel('POST', '/familles', { nom: `Puériculture-${suffixe}` });
    const sousFamille = await appel('POST', `/familles/${famille.id}/sous-familles`, { nom: 'Biberons' });
    console.log('   Famille:', famille.nom, '/ Sous-famille:', sousFamille.nom);

    ligne('Création d\'un article de test');
    const article = await appel('POST', '/articles', {
      reference: `TEST-${Date.now()}`,
      designation: 'Biberon test 250ml',
      familleId: famille.id,
      sousFamilleId: sousFamille.id,
      prixAchat: 1500,
      prixVente: 3000,
      seuilAlerte: 2,
    });
    console.log('   Article créé id:', article.id);

    ligne('Réception de 20 unités à l\'entrepôt (fournisseur non renseigné)');
    await appel('POST', '/stock/receptions', {
      lieuId: entrepot.id,
      lignes: [{ articleId: article.id, quantite: 20, prixAchat: 1500 }],
    });

    ligne('Transfert de 10 unités entrepôt -> boutique');
    await appel('POST', '/stock/transferts', {
      reference: `TR-${Date.now()}`,
      lieuSourceId: entrepot.id,
      lieuDestinationId: boutique.id,
      lignes: [{ articleId: article.id, quantite: 10 }],
    });

    ligne('Vérification du stock par lieu');
    const stockEntrepot = await appel('GET', `/stock/lieux/${entrepot.id}/stock`);
    const stockBoutique = await appel('GET', `/stock/lieux/${boutique.id}/stock`);
    console.log('   Stock entrepôt:', stockEntrepot.find((s) => s.articleId === article.id)?.quantite);
    console.log('   Stock boutique:', stockBoutique.find((s) => s.articleId === article.id)?.quantite);

    ligne('Création d\'un client de test');
    const client = await appel('POST', '/clients', {
      nomComplet: 'Cliente Test',
      telephone: `+225${Date.now()}`.slice(0, 13),
    });

    ligne('Activation d\'une carte cadeau de 10 000f');
    const codeCarte = `CARTE-TEST-${Date.now()}`;
    const carte = await appel('POST', '/cartes-cadeaux/activer', { codeBarre: codeCarte, denomination: 10000 });
    console.log('   Carte activée, statut:', carte.statut);

    ligne('Vente de 3 unités payée avec la carte cadeau');
    const vente = await appel('POST', '/ventes', {
      clientId: client?.id,
      lieuId: boutique.id,
      modePaiement: 'carte cadeau',
      carteCadeauCode: codeCarte,
      lignes: [{ articleId: article.id, quantite: 3, prixUnitaire: 3000 }],
    });
    console.log('   Vente créée id:', vente.id, '| total net:', vente.totalNet);

    ligne('Vérification que la carte est bien UTILISEE');
    const carteApresVente = await appel('GET', `/cartes-cadeaux/${codeCarte}`);
    console.log('   Statut carte après vente:', carteApresVente.statut);

    ligne('Vérification du stock boutique après la vente (doit être 7)');
    const stockApresVente = await appel('GET', `/stock/lieux/${boutique.id}/stock`);
    console.log('   Stock boutique:', stockApresVente.find((s) => s.articleId === article.id)?.quantite);

    ligne('Annulation de la vente');
    await appel('POST', `/ventes/${vente.id}/annuler`, { motif: 'Test automatique' });

    ligne('Vérification du stock boutique après annulation (doit revenir à 10)');
    const stockApresAnnulation = await appel('GET', `/stock/lieux/${boutique.id}/stock`);
    console.log('   Stock boutique:', stockApresAnnulation.find((s) => s.articleId === article.id)?.quantite);

    ligne('Vérification que la carte cadeau est redevenue ACTIVE');
    const carteApresAnnulation = await appel('GET', `/cartes-cadeaux/${codeCarte}`);
    console.log('   Statut carte après annulation:', carteApresAnnulation.statut);

    ligne('Consultation du dashboard');
    const dashboard = await appel('GET', '/dashboard');
    console.log('   Ventes du jour:', dashboard.ventes.nombre, '| Total:', dashboard.ventes.total);
    console.log('   Alertes stock:', dashboard.alertesStock.length);

    console.log('\n🎉 Scénario complet terminé sans erreur.');
  } catch (err) {
    console.log('\n💥 Le scénario s\'est arrêté :', err.message);
    process.exit(1);
  }
}

main();
