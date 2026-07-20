require('dotenv').config();
require('express-async-errors'); // capture les erreurs async non gérées dans les contrôleurs
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const familleRoutes = require('./routes/familleRoutes');
const articleRoutes = require('./routes/articleRoutes');
const stockRoutes = require('./routes/stockRoutes');
const venteRoutes = require('./routes/venteRoutes');
const demandeRemiseRoutes = require('./routes/demandeRemiseRoutes');
const carteCadeauRoutes = require('./routes/carteCadeauRoutes');
const listeCadeauRoutes = require('./routes/listeCadeauRoutes');
const depenseRoutes = require('./routes/depenseRoutes');
const etatRoutes = require('./routes/etatRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const clientRoutes = require('./routes/clientRoutes');
const vendeurRoutes = require('./routes/vendeurRoutes');
const creditRoutes = require('./routes/creditRoutes');
const retourRoutes = require('./routes/retourRoutes');
const avoirRoutes = require('./routes/avoirRoutes');
const utilisateurRoutes = require('./routes/utilisateurRoutes');
const fideliteRoutes = require('./routes/fideliteRoutes');
const journalRoutes = require('./routes/journalRoutes');
const roleRoutes = require('./routes/roleRoutes');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'Jesma U - Gestion Commerciale' }));

app.use('/api/auth', authRoutes);
app.use('/api/familles', familleRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/ventes', venteRoutes);
app.use('/api/demandes-remise', demandeRemiseRoutes);
app.use('/api/cartes-cadeaux', carteCadeauRoutes);
app.use('/api/listes-cadeaux', listeCadeauRoutes);
app.use('/api/depenses', depenseRoutes);
app.use('/api/etats', etatRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/vendeurs', vendeurRoutes);
app.use('/api/credits', creditRoutes);
app.use('/api/retours', retourRoutes);
app.use('/api/avoirs', avoirRoutes);
app.use('/api/utilisateurs', utilisateurRoutes);
app.use('/api/fidelite', fideliteRoutes);
app.use('/api/journal', journalRoutes);
app.use('/api/roles', roleRoutes);

// Gestionnaire d'erreurs générique
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Cette valeur existe déjà (contrainte unique).' });
  }
  res.status(500).json({ error: 'Erreur serveur.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Jesma U backend démarré sur le port ${PORT}`));