// Génère la représentation binaire (barres/espaces) puis le SVG d'un code EAN-13,
// selon l'algorithme standard (tables L/G/R + motif de parité par 1er chiffre).

const L = {
  0: '0001101', 1: '0011001', 2: '0010011', 3: '0111101', 4: '0100011',
  5: '0110001', 6: '0101111', 7: '0111011', 8: '0110111', 9: '0001011',
};
const G = {
  0: '0100111', 1: '0110011', 2: '0011011', 3: '0100001', 4: '0011101',
  5: '0111001', 6: '0000101', 7: '0010001', 8: '0001001', 9: '0010111',
};
const R = {
  0: '1110010', 1: '1100110', 2: '1101100', 3: '1000010', 4: '1011100',
  5: '1001110', 6: '1010000', 7: '1000100', 8: '1001000', 9: '1110100',
};
const PARITE_PREMIER_CHIFFRE = {
  0: 'LLLLLL', 1: 'LLGLGG', 2: 'LLGGLG', 3: 'LLGGGL', 4: 'LGLLGG',
  5: 'LGGLLG', 6: 'LGGGLL', 7: 'LGLGLG', 8: 'LGLGGL', 9: 'LGGLGL',
};

function moduleBinaireEAN13(code13) {
  if (!/^\d{13}$/.test(code13)) throw new Error('Le code doit comporter exactement 13 chiffres.');

  const premier = code13[0];
  const gauche = code13.slice(1, 7);
  const droite = code13.slice(7, 13);
  const motif = PARITE_PREMIER_CHIFFRE[premier];

  let bits = '101'; // garde de début
  for (let i = 0; i < 6; i++) {
    const table = motif[i] === 'L' ? L : G;
    bits += table[gauche[i]];
  }
  bits += '01010'; // garde centrale
  for (let i = 0; i < 6; i++) {
    bits += R[droite[i]];
  }
  bits += '101'; // garde de fin

  return bits; // chaîne de 95 caractères '0'/'1'
}

// Génère un SVG autonome (utilisable dans une page d'impression d'étiquettes)
function genererSvgEAN13(code13, { largeur = 200, hauteur = 70 } = {}) {
  const bits = moduleBinaireEAN13(code13);
  const largeurModule = largeur / bits.length;

  let rects = '';
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') {
      rects += `<rect x="${(i * largeurModule).toFixed(2)}" y="0" width="${largeurModule.toFixed(2)}" height="${hauteur}" fill="black" />`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}">${rects}</svg>`;
}

module.exports = { genererSvgEAN13, moduleBinaireEAN13 };
