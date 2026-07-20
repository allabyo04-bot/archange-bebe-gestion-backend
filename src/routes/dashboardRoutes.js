const express = require('express');
const router = express.Router();
const { obtenirDashboard } = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, obtenirDashboard);

module.exports = router;
