import { Injectable } from '@angular/core';

declare const require: (module: string) => any;

/**
 * SpellCheckService — Corrector ortográfico real con diccionario Hunspell español.
 * Funciona igual que Microsoft Word:
 *   ▸ Subraya palabras mal escritas con línea ondulada roja
 *   ▸ Muestra sugerencias al hacer clic sobre la palabra
 *   ▸ Reemplaza la palabra al seleccionar una sugerencia
 */
@Injectable({ providedIn: 'root' })
export class SpellCheckService {
  private spell: any = null;
  private loadPromise: Promise<void> | null = null;
  private _isReady = false;

  /** Inicia la carga del diccionario (sólo se carga una vez) */
  async initialize(): Promise<void> {
    if (this._isReady) return;
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this._load();
    return this.loadPromise;
  }

  private async _load(): Promise<void> {
    try {
      // Intentar cargar desde ruta raíz /assets/ o relativa assets/
      let affRes = await fetch('/assets/dictionaries/es.aff');
      let dicRes = await fetch('/assets/dictionaries/es.dic');

      if (!affRes.ok || !dicRes.ok) {
        affRes = await fetch('assets/dictionaries/es.aff');
        dicRes = await fetch('assets/dictionaries/es.dic');
      }

      if (!affRes.ok || !dicRes.ok) {
        throw new Error(`No se pudo cargar el diccionario (AFF status: ${affRes.status}, DIC status: ${dicRes.status})`);
      }

      const [aff, dic] = await Promise.all([affRes.text(), dicRes.text()]);

      const nspellFn = require('nspell');
      this.spell = nspellFn(aff, dic);
      this._isReady = true;
      console.log('[SpellCheck] ✅ Diccionario español cargado correctamente (%d líneas)', dic.split('\n').length);
    } catch (err) {
      console.error('[SpellCheck] ❌ Error al inicializar corrector:', err);
    }
  }

  /** true cuando el diccionario está listo para usarse */
  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Devuelve true si la palabra está bien escrita en español.
   */
  isCorrect(word: string): boolean {
    if (!this.spell) return true;
    const clean = word.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ']/g, '');
    if (!clean || clean.length < 2) return true;
    return this.spell.correct(clean) || this.spell.correct(clean.toLowerCase());
  }

  /**
   * Devuelve sugerencias de corrección para una palabra mal escrita.
   */
  suggest(word: string): string[] {
    if (!this.spell) return [];
    const clean = word.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ']/g, '');
    if (!clean || clean.length < 2) return [];

    const raw: string[] = this.spell.suggest(clean);

    const firstIsUpper = word.length > 0
      && word[0] === word[0].toUpperCase()
      && word[0] !== word[0].toLowerCase();

    return firstIsUpper
      ? raw.map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).slice(0, 6)
      : raw.slice(0, 6);
  }
}
