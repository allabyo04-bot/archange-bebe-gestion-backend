const { PrismaClient } = require('@prisma/client');

// Singleton pour éviter d'ouvrir trop de connexions en dev (hot reload) et en prod
const prisma = new PrismaClient();

module.exports = prisma;
