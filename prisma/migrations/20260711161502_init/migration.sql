-- CreateEnum
CREATE TYPE "RoleUtilisateur" AS ENUM ('ADMIN', 'CAISSIER');

-- CreateEnum
CREATE TYPE "TypeLieu" AS ENUM ('ENTREPOT', 'BOUTIQUE');

-- CreateEnum
CREATE TYPE "StatutTransfert" AS ENUM ('VALIDE', 'ANNULE');

-- CreateEnum
CREATE TYPE "TypeMouvementStock" AS ENUM ('ENTREE_RECEPTION', 'SORTIE_VENTE', 'ANNULATION_VENTE', 'CORRECTION_INVENTAIRE', 'RETOUR_CLIENT', 'TRANSFERT_SORTIE', 'TRANSFERT_ENTREE');

-- CreateEnum
CREATE TYPE "TypeRecompenseFidelite" AS ENUM ('A_DEFINIR', 'REMISE', 'ARTICLE', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutRecompenseFidelite" AS ENUM ('EN_ATTENTE', 'DEFINIE', 'UTILISEE');

-- CreateEnum
CREATE TYPE "StatutVente" AS ENUM ('VALIDEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "StatutDemandeRemise" AS ENUM ('EN_ATTENTE', 'APPROUVEE', 'REFUSEE');

-- CreateEnum
CREATE TYPE "StatutCarteCadeau" AS ENUM ('INACTIVE', 'ACTIVE', 'UTILISEE');

-- CreateTable
CREATE TABLE "Utilisateur" (
    "id" SERIAL NOT NULL,
    "nomUtilisateur" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "nomComplet" TEXT NOT NULL,
    "role" "RoleUtilisateur" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Famille" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Famille_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SousFamille" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "familleId" INTEGER NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SousFamille_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" SERIAL NOT NULL,
    "reference" TEXT NOT NULL,
    "codeBarre" TEXT,
    "codeBarreGenere" BOOLEAN NOT NULL DEFAULT false,
    "codeInterne" TEXT,
    "designation" TEXT NOT NULL,
    "familleId" INTEGER,
    "sousFamilleId" INTEGER,
    "prixAchat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "prixVente" DECIMAL(65,30) NOT NULL,
    "stockActuel" INTEGER NOT NULL DEFAULT 0,
    "seuilAlerte" INTEGER NOT NULL DEFAULT 5,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lieu" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "type" "TypeLieu" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Lieu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockEmplacement" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "lieuId" INTEGER NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StockEmplacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reception" (
    "id" SERIAL NOT NULL,
    "fournisseur" TEXT,
    "reference" TEXT,
    "lieuId" INTEGER NOT NULL,
    "dateReception" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneReception" (
    "id" SERIAL NOT NULL,
    "receptionId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "quantite" INTEGER NOT NULL,
    "prixAchat" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "LigneReception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransfertStock" (
    "id" SERIAL NOT NULL,
    "reference" TEXT NOT NULL,
    "lieuSourceId" INTEGER NOT NULL,
    "lieuDestinationId" INTEGER NOT NULL,
    "statut" "StatutTransfert" NOT NULL DEFAULT 'VALIDE',
    "dateTransfert" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransfertStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneTransfertStock" (
    "id" SERIAL NOT NULL,
    "transfertId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "quantite" INTEGER NOT NULL,

    CONSTRAINT "LigneTransfertStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MouvementStock" (
    "id" SERIAL NOT NULL,
    "articleId" INTEGER NOT NULL,
    "lieuId" INTEGER NOT NULL,
    "type" "TypeMouvementStock" NOT NULL,
    "quantite" INTEGER NOT NULL,
    "stockAvant" INTEGER NOT NULL,
    "stockApres" INTEGER NOT NULL,
    "utilisateurId" INTEGER NOT NULL,
    "refVenteId" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MouvementStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" SERIAL NOT NULL,
    "nomComplet" TEXT NOT NULL,
    "telephone" TEXT,
    "email" TEXT,
    "pointsFidelite" INTEGER NOT NULL DEFAULT 0,
    "achatsConsecutifs" INTEGER NOT NULL DEFAULT 0,
    "montantCumuleConsecutif" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecompenseFidelite" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "montantCumule" DECIMAL(65,30) NOT NULL,
    "type" "TypeRecompenseFidelite" NOT NULL DEFAULT 'A_DEFINIR',
    "articleOffertId" INTEGER,
    "valeurRemise" DECIMAL(65,30),
    "description" TEXT,
    "statut" "StatutRecompenseFidelite" NOT NULL DEFAULT 'EN_ATTENTE',
    "dateAtteinte" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateUtilisation" TIMESTAMP(3),

    CONSTRAINT "RecompenseFidelite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendeur" (
    "id" SERIAL NOT NULL,
    "nomComplet" TEXT NOT NULL,
    "telephone" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vendeur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vente" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "clientId" INTEGER,
    "utilisateurId" INTEGER NOT NULL,
    "vendeurId" INTEGER,
    "lieuId" INTEGER NOT NULL,
    "statut" "StatutVente" NOT NULL DEFAULT 'VALIDEE',
    "totalHT" DECIMAL(65,30) NOT NULL,
    "remiseMontant" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalNet" DECIMAL(65,30) NOT NULL,
    "modePaiement" TEXT,
    "carteCadeauUtiliseeId" INTEGER,
    "dateAnnulation" TIMESTAMP(3),
    "motifAnnulation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneVente" (
    "id" SERIAL NOT NULL,
    "venteId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "quantite" INTEGER NOT NULL,
    "prixUnitaire" DECIMAL(65,30) NOT NULL,
    "remiseLigne" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "LigneVente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemandeRemise" (
    "id" SERIAL NOT NULL,
    "venteId" INTEGER NOT NULL,
    "demandeurId" INTEGER NOT NULL,
    "montantDemande" DECIMAL(65,30) NOT NULL,
    "motif" TEXT,
    "statut" "StatutDemandeRemise" NOT NULL DEFAULT 'EN_ATTENTE',
    "approbateurId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "DemandeRemise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DenominationCarteCadeau" (
    "id" SERIAL NOT NULL,
    "montant" DECIMAL(65,30) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DenominationCarteCadeau_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarteCadeau" (
    "id" SERIAL NOT NULL,
    "codeBarre" TEXT NOT NULL,
    "denomination" DECIMAL(65,30) NOT NULL,
    "statut" "StatutCarteCadeau" NOT NULL DEFAULT 'INACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarteCadeau_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarteCadeauCycle" (
    "id" SERIAL NOT NULL,
    "carteCadeauId" INTEGER NOT NULL,
    "denomination" DECIMAL(65,30) NOT NULL,
    "dateActivation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateUtilisation" TIMESTAMP(3),
    "utilisateurId" INTEGER NOT NULL,

    CONSTRAINT "CarteCadeauCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListeCadeau" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "titre" TEXT,
    "codeAcces" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListeCadeau_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LigneListeCadeau" (
    "id" SERIAL NOT NULL,
    "listeCadeauId" INTEGER NOT NULL,
    "articleId" INTEGER NOT NULL,
    "quantiteSouhaitee" INTEGER NOT NULL,
    "quantiteOfferte" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LigneListeCadeau_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListeCadeauCarteUtilisee" (
    "id" SERIAL NOT NULL,
    "listeCadeauId" INTEGER NOT NULL,
    "carteCadeauId" INTEGER NOT NULL,
    "offrePar" TEXT,
    "canal" TEXT NOT NULL,
    "montantUtilise" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListeCadeauCarteUtilisee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorieDepense" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,

    CONSTRAINT "CategorieDepense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Depense" (
    "id" SERIAL NOT NULL,
    "categorieId" INTEGER NOT NULL,
    "montant" DECIMAL(65,30) NOT NULL,
    "description" TEXT,
    "utilisateurId" INTEGER NOT NULL,
    "dateDepense" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Depense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Utilisateur_nomUtilisateur_key" ON "Utilisateur"("nomUtilisateur");

-- CreateIndex
CREATE UNIQUE INDEX "Famille_nom_key" ON "Famille"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "SousFamille_familleId_nom_key" ON "SousFamille"("familleId", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "Article_reference_key" ON "Article"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Article_codeBarre_key" ON "Article"("codeBarre");

-- CreateIndex
CREATE UNIQUE INDEX "Article_codeInterne_key" ON "Article"("codeInterne");

-- CreateIndex
CREATE UNIQUE INDEX "Lieu_nom_key" ON "Lieu"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "StockEmplacement_articleId_lieuId_key" ON "StockEmplacement"("articleId", "lieuId");

-- CreateIndex
CREATE UNIQUE INDEX "TransfertStock_reference_key" ON "TransfertStock"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Client_telephone_key" ON "Client"("telephone");

-- CreateIndex
CREATE UNIQUE INDEX "Vente_numero_key" ON "Vente"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "DenominationCarteCadeau_montant_key" ON "DenominationCarteCadeau"("montant");

-- CreateIndex
CREATE UNIQUE INDEX "CarteCadeau_codeBarre_key" ON "CarteCadeau"("codeBarre");

-- CreateIndex
CREATE UNIQUE INDEX "ListeCadeau_codeAcces_key" ON "ListeCadeau"("codeAcces");

-- CreateIndex
CREATE UNIQUE INDEX "CategorieDepense_nom_key" ON "CategorieDepense"("nom");

-- AddForeignKey
ALTER TABLE "SousFamille" ADD CONSTRAINT "SousFamille_familleId_fkey" FOREIGN KEY ("familleId") REFERENCES "Famille"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_familleId_fkey" FOREIGN KEY ("familleId") REFERENCES "Famille"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_sousFamilleId_fkey" FOREIGN KEY ("sousFamilleId") REFERENCES "SousFamille"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEmplacement" ADD CONSTRAINT "StockEmplacement_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEmplacement" ADD CONSTRAINT "StockEmplacement_lieuId_fkey" FOREIGN KEY ("lieuId") REFERENCES "Lieu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reception" ADD CONSTRAINT "Reception_lieuId_fkey" FOREIGN KEY ("lieuId") REFERENCES "Lieu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneReception" ADD CONSTRAINT "LigneReception_receptionId_fkey" FOREIGN KEY ("receptionId") REFERENCES "Reception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneReception" ADD CONSTRAINT "LigneReception_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransfertStock" ADD CONSTRAINT "TransfertStock_lieuSourceId_fkey" FOREIGN KEY ("lieuSourceId") REFERENCES "Lieu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransfertStock" ADD CONSTRAINT "TransfertStock_lieuDestinationId_fkey" FOREIGN KEY ("lieuDestinationId") REFERENCES "Lieu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneTransfertStock" ADD CONSTRAINT "LigneTransfertStock_transfertId_fkey" FOREIGN KEY ("transfertId") REFERENCES "TransfertStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneTransfertStock" ADD CONSTRAINT "LigneTransfertStock_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_lieuId_fkey" FOREIGN KEY ("lieuId") REFERENCES "Lieu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_refVenteId_fkey" FOREIGN KEY ("refVenteId") REFERENCES "Vente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecompenseFidelite" ADD CONSTRAINT "RecompenseFidelite_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vente" ADD CONSTRAINT "Vente_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vente" ADD CONSTRAINT "Vente_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vente" ADD CONSTRAINT "Vente_vendeurId_fkey" FOREIGN KEY ("vendeurId") REFERENCES "Vendeur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vente" ADD CONSTRAINT "Vente_lieuId_fkey" FOREIGN KEY ("lieuId") REFERENCES "Lieu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vente" ADD CONSTRAINT "Vente_carteCadeauUtiliseeId_fkey" FOREIGN KEY ("carteCadeauUtiliseeId") REFERENCES "CarteCadeau"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneVente" ADD CONSTRAINT "LigneVente_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "Vente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneVente" ADD CONSTRAINT "LigneVente_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeRemise" ADD CONSTRAINT "DemandeRemise_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "Vente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeRemise" ADD CONSTRAINT "DemandeRemise_demandeurId_fkey" FOREIGN KEY ("demandeurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeRemise" ADD CONSTRAINT "DemandeRemise_approbateurId_fkey" FOREIGN KEY ("approbateurId") REFERENCES "Utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarteCadeauCycle" ADD CONSTRAINT "CarteCadeauCycle_carteCadeauId_fkey" FOREIGN KEY ("carteCadeauId") REFERENCES "CarteCadeau"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarteCadeauCycle" ADD CONSTRAINT "CarteCadeauCycle_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListeCadeau" ADD CONSTRAINT "ListeCadeau_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneListeCadeau" ADD CONSTRAINT "LigneListeCadeau_listeCadeauId_fkey" FOREIGN KEY ("listeCadeauId") REFERENCES "ListeCadeau"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LigneListeCadeau" ADD CONSTRAINT "LigneListeCadeau_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListeCadeauCarteUtilisee" ADD CONSTRAINT "ListeCadeauCarteUtilisee_listeCadeauId_fkey" FOREIGN KEY ("listeCadeauId") REFERENCES "ListeCadeau"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListeCadeauCarteUtilisee" ADD CONSTRAINT "ListeCadeauCarteUtilisee_carteCadeauId_fkey" FOREIGN KEY ("carteCadeauId") REFERENCES "CarteCadeau"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "CategorieDepense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "Utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

