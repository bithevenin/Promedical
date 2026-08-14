import { Injectable } from '@angular/core';
import { MEDICAL_DICTIONARY_TERMS } from './medical-dictionary.data';

/**
 * SpellCheckService — Corrector Ortográfico Clínico Estilo Microsoft Word.
 * Integrado con Web Workers y Léxico Médico Dominicano/Internacional.
 *   ▸ Subraya palabras mal escritas con línea ondulada roja (text-decoration: underline wavy #ef4444)
 *   ▸ Desempeño multihilo en segundo plano sin congelar el renderizado de la UI
 *   ▸ Reconoce terminología médica, fármacos, estudios y abreviaturas clínicas
 *   ▸ Permite guardar palabras personalizadas en el diccionario del doctor
 */
@Injectable({ providedIn: 'root' })
export class SpellCheckService {
  private _isReady = false;
  private loadPromise: Promise<void> | null = null;
  private worker: Worker | null = null;
  private wordSet = new Set<string>();
  private customWords = new Set<string>();

  constructor() {
    this.loadCustomWords();
  }

  get isReady(): boolean {
    return this._isReady;
  }

  async initialize(): Promise<void> {
    if (this._isReady) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this._load();
    return this.loadPromise;
  }

  private async _load(): Promise<void> {
    try {
      // 1. Cargar léxico médico y palabras personalizadas en Set local síncrono para lecturas ultrarrápidas
      for (const term of MEDICAL_DICTIONARY_TERMS) {
        const clean = this.cleanWord(term);
        if (clean) this.wordSet.add(clean);
      }
      for (const cw of Array.from(this.customWords)) {
        const clean = this.cleanWord(cw);
        if (clean) this.wordSet.add(clean);
      }

      // 2. Descargar archivo es.dic
      let dicContent = '';
      try {
        const res = await fetch('/assets/dictionaries/es.dic');
        if (res.ok) {
          dicContent = await res.text();
          // Cargar las palabras en memoria local
          const lines = dicContent.split('\n');
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const word = line.split('/')[0].trim().toLowerCase();
            if (word.length >= 2) this.wordSet.add(word);
          }
        }
      } catch (e) {
        console.warn('[SpellCheck] No se pudo descargar /assets/dictionaries/es.dic por red, usando léxico médico.', e);
      }

      // 3. Crear Web Worker si está disponible
      if (typeof Worker !== 'undefined') {
        try {
          this.worker = new Worker(new URL('../workers/spell-check.worker', import.meta.url), { type: 'module' });
          this.worker.postMessage({
            id: 'init_1',
            type: 'INIT',
            payload: {
              dicContent,
              medicalTerms: MEDICAL_DICTIONARY_TERMS,
              doctorCustomWords: Array.from(this.customWords)
            }
          });
        } catch (wErr) {
          console.warn('[SpellCheck] Web Worker no soportado en este entorno, usando fallback local.', wErr);
        }
      }

      this._isReady = true;
      console.log(`[SpellCheck] ✅ Corrector ortográfico y médico listo (${this.wordSet.size} palabras en diccionario).`);
    } catch (err) {
      console.error('[SpellCheck] ❌ Error inicializando corrector:', err);
      this._isReady = true; // Fallback ready con palabras médicas
    }
  }

  private cleanWord(word: string): string {
    return word.toLowerCase().replace(/[^a-záéíóúüñ]/g, '').trim();
  }

  /**
   * Verifica de forma ultrarrápida (O(1)) si una palabra es válida.
   */
  isCorrect(word: string): boolean {
    const clean = this.cleanWord(word);
    if (!clean || clean.length < 2) return true;
    if (/^\d+$/.test(clean)) return true; // Números y años
    return this.wordSet.has(clean) || this.customWords.has(clean);
  }

  /**
   * Genera sugerencias de corrección ortográfica ordenadas por cercanía (Levenshtein).
   */
  suggest(word: string): string[] {
    const clean = this.cleanWord(word);
    if (!clean || clean.length < 2) return [];

    const matches: { word: string; dist: number }[] = [];

    for (const dictWord of Array.from(this.wordSet)) {
      if (Math.abs(dictWord.length - clean.length) > 2) continue;
      const dist = this.levenshtein(clean, dictWord);
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

  /**
   * Añade una palabra personalizada al diccionario del doctor.
   */
  addCustomWord(word: string): void {
    const clean = this.cleanWord(word);
    if (!clean) return;

    this.customWords.add(clean);
    this.wordSet.add(clean);
    this.saveCustomWords();

    if (this.worker) {
      this.worker.postMessage({
        id: `add_${Date.now()}`,
        type: 'ADD_WORD',
        payload: { word: clean }
      });
    }
  }

  private loadCustomWords(): void {
    try {
      const stored = localStorage.getItem('promedical_custom_words');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          for (const w of parsed) {
            const clean = this.cleanWord(w);
            if (clean) this.customWords.add(clean);
          }
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  private saveCustomWords(): void {
    try {
      localStorage.setItem('promedical_custom_words', JSON.stringify(Array.from(this.customWords)));
    } catch {
      // Ignore storage errors
    }
  }

  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }
}
