/// <reference lib="webworker" />

/**
 * Web Worker del Corrector Ortográfico Clínico para ProMedical.
 * Procesa diccionarios de 120,000+ palabras y lexico médico fuera del hilo principal de la interfaz.
 */

const wordSet = new Set<string>();
const customWords = new Set<string>();

function cleanWord(word: string): string {
  return word.toLowerCase().replace(/[^a-záéíóúüñ]/g, '').trim();
}

function isWordValid(clean: string): boolean {
  if (!clean || clean.length < 2) return true;
  if (/^\d+$/.test(clean)) return true; // Números
  return wordSet.has(clean) || customWords.has(clean);
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // sustitución
          matrix[i][j - 1] + 1,     // inserción
          matrix[i - 1][j] + 1      // borrado
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function generateSuggestions(word: string): string[] {
  const clean = cleanWord(word);
  if (!clean || clean.length < 2) return [];

  const matches: { word: string; dist: number }[] = [];

  for (const dictWord of wordSet) {
    if (Math.abs(dictWord.length - clean.length) > 2) continue;
    const dist = levenshtein(clean, dictWord);
    if (dist <= 2 || (clean.length > 5 && dist <= 3)) {
      const penalty = (dictWord[0] === clean[0]) ? 0 : 1;
      matches.push({ word: dictWord, dist: dist + penalty });
    }
  }

  matches.sort((a, b) => a.dist - b.dist);
  const top = matches.map(m => m.word).slice(0, 6);

  const firstIsUpper = word.length > 0 && word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase();
  return firstIsUpper ? top.map(s => s.charAt(0).toUpperCase() + s.slice(1)) : top;
}

addEventListener('message', async (event: MessageEvent) => {
  const { id, type, payload } = event.data;

  if (type === 'INIT') {
    try {
      const { dicContent, medicalTerms, doctorCustomWords } = payload;
      
      // Parsear es.dic
      if (dicContent) {
        const lines = dicContent.split('\n');
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const word = line.split('/')[0].trim().toLowerCase();
          if (word.length >= 2) wordSet.add(word);
        }
      }

      // Cargar léxico médico
      if (medicalTerms && Array.isArray(medicalTerms)) {
        for (const term of medicalTerms) {
          const clean = cleanWord(term);
          if (clean) wordSet.add(clean);
        }
      }

      // Cargar palabras personalizadas del doctor
      if (doctorCustomWords && Array.isArray(doctorCustomWords)) {
        for (const cw of doctorCustomWords) {
          const clean = cleanWord(cw);
          if (clean) customWords.add(clean);
        }
      }

      postMessage({ id, type: 'INIT_RESULT', success: true, totalWords: wordSet.size });
    } catch (err: any) {
      postMessage({ id, type: 'INIT_RESULT', success: false, error: err.message });
    }
  } else if (type === 'CHECK') {
    const { word } = payload;
    const clean = cleanWord(word);
    const valid = isWordValid(clean);
    postMessage({ id, type: 'CHECK_RESULT', word, isCorrect: valid });
  } else if (type === 'SUGGEST') {
    const { word } = payload;
    const suggestions = generateSuggestions(word);
    postMessage({ id, type: 'SUGGEST_RESULT', word, suggestions });
  } else if (type === 'ADD_WORD') {
    const { word } = payload;
    const clean = cleanWord(word);
    if (clean) {
      customWords.add(clean);
      wordSet.add(clean);
    }
    postMessage({ id, type: 'ADD_WORD_RESULT', success: true, word });
  }
});
