const BASE_URL = import.meta.env.VITE_API_URL || 'https://jesma-u-gestion-backend-production.up.railway.app/api';

function getToken() {
  return localStorage.getItem('jesma_token');
}

export function setSession(token, utilisateur) {
  localStorage.setItem('jesma_token', token);
  localStorage.setItem('jesma_utilisateur', JSON.stringify(utilisateur));
}

export function clearSession() {
  localStorage.removeItem('jesma_token');
  localStorage.removeItem('jesma_utilisateur');
}

export function getUtilisateur() {
  const brut = localStorage.getItem('jesma_utilisateur');
  return brut ? JSON.parse(brut) : null;
}

export async function appelApi(methode, chemin, corps) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const reponse = await fetch(`${BASE_URL}${chemin}`, {
    method: methode,
    headers,
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const texte = await reponse.text();
  let data;
  try { data = texte ? JSON.parse(texte) : null; } catch { data = texte; }
  if (!reponse.ok) {
    const message = (data && data.error) || 'Une erreur est survenue.';
    const erreur = new Error(message);
    if (data && typeof data === 'object') Object.assign(erreur, data);
    throw erreur;
  }
  return data;
}

// Appel API sans authentification, pour les pages publiques (ex: consultation d'une
// liste cadeau via son lien partagé) — jamais de token envoyé, même si l'utilisateur
// courant est connecté par ailleurs dans un autre onglet.
export async function appelApiPublic(methode, chemin, corps) {
  const reponse = await fetch(`${BASE_URL}${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const texte = await reponse.text();
  let data;
  try { data = texte ? JSON.parse(texte) : null; } catch { data = texte; }
  if (!reponse.ok) {
    const message = (data && data.error) || 'Une erreur est survenue.';
    throw new Error(message);
  }
  return data;
}

// Récupère une page HTML protégée par connexion (ex: étiquettes à imprimer) — impossible
// via une simple ouverture de lien classique car le token ne serait pas transmis.
export async function recupererHtmlAvecAuth(chemin) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const reponse = await fetch(`${BASE_URL}${chemin}`, { headers });
  const texte = await reponse.text();
  if (!reponse.ok) {
    throw new Error('Impossible de récupérer les étiquettes.');
  }
  return texte;
}

// Télécharge un fichier protégé par connexion (ex: export CSV) — impossible via un lien
// classique car le token ne serait pas transmis. Déclenche le téléchargement directement
// dans le navigateur, avec le nom de fichier fourni.
export async function telechargerFichierAvecAuth(chemin, nomFichier) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const reponse = await fetch(`${BASE_URL}${chemin}`, { headers });
  if (!reponse.ok) {
    let message = 'Échec du téléchargement.';
    try {
      const data = await reponse.json();
      if (data && data.error) message = data.error;
    } catch { /* réponse non JSON, on garde le message générique */ }
    throw new Error(message);
  }

  const blob = await reponse.blob();
  const url = window.URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  window.URL.revokeObjectURL(url);
}

// Upload multipart générique (fichier Excel d'import stock)
export async function uploaderFichierImport(fichier) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const formData = new FormData();
  formData.append('fichier', fichier);

  const reponse = await fetch(`${BASE_URL}/stock/import/previsualiser`, {
    method: 'POST',
    headers,
    body: formData,
  });
  const texte = await reponse.text();
  let data;
  try { data = texte ? JSON.parse(texte) : null; } catch { data = texte; }
  if (!reponse.ok) {
    const message = (data && data.error) || "Échec de la lecture du fichier.";
    throw new Error(message);
  }
  return data;
}

// Upload multipart (photo article) : pas de Content-Type JSON, FormData gère l'en-tête lui-même
export async function uploaderPhotoArticle(articleId, fichier) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const formData = new FormData();
  formData.append('photo', fichier);

  const reponse = await fetch(`${BASE_URL}/articles/${articleId}/photo`, {
    method: 'POST',
    headers,
    body: formData,
  });
  const texte = await reponse.text();
  let data;
  try { data = texte ? JSON.parse(texte) : null; } catch { data = texte; }
  if (!reponse.ok) {
    const message = (data && data.error) || "Échec de l'upload de la photo.";
    throw new Error(message);
  }
  return data;
}
// Envoie une requête POST authentifiée et récupère une page HTML en retour (ex: impression
// d'étiquettes avec des quantités choisies) — impossible via un lien classique car le
// token et le corps de la requête ne seraient pas transmis.
export async function envoyerEtRecupererHtmlAvecAuth(chemin, corps) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const reponse = await fetch(`${BASE_URL}${chemin}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(corps),
  });
  const texte = await reponse.text();
  if (!reponse.ok) {
    let message = 'Impossible de générer les étiquettes.';
    try {
      const data = JSON.parse(texte);
      if (data && data.error) message = data.error;
    } catch { /* réponse non JSON, message générique conservé */ }
    throw new Error(message);
  }
  return texte;
}