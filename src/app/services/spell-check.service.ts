import { Injectable } from '@angular/core';

// webpack provee `require` como global en el bundle del browser
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
      // Cargar los archivos Hunspell del diccionario español desde assets
      const [affRes, dicRes] = await Promise.all([
        fetch('assets/dictionaries/es.aff'),
        fetch('assets/dictionaries/es.dic')
      ]);

      if (!affRes.ok || !dicRes.ok) {
        throw new Error('No se pudo cargar el diccionario español');
      }

      const [aff, dic] = await Promise.all([affRes.text(), dicRes.text()]);

      // require() está disponible en webpack (lo sustituye en el bundle)
      const nspellFn = require('nspell');
      this.spell = nspellFn(aff, dic);
      this._isReady = true;
      console.log('[SpellCheck] ✅ Diccionario español cargado correctamente — %d palabras aprox.', dic.split('\n').length);
    } catch (err) {
      console.error('[SpellCheck] ❌ Error al cargar corrector:', err);
    }
  }

  /** true cuando el diccionario está listo para usarse */
  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Devuelve true si la palabra está bien escrita en español.
   * Palabras menores a 2 letras o que sean puramente numéricas siempre se consideran correctas.
   */
  isCorrect(word: string): boolean {
    if (!this.spell) return true;
    const clean = word.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ']/g, '');
    if (!clean || clean.length < 2) return true;
    return this.spell.correct(clean) || this.spell.correct(clean.toLowerCase());
  }

  /**
   * Devuelve hasta 6 sugerencias de corrección para una palabra mal escrita.
   * Si la palabra empieza con mayúscula, las sugerencias también lo harán.
   */
  suggest(word: string): string[] {
    if (!this.spell) return [];
    const clean = word.replace(/[^a-záéíóúüñA-ZÁÉÍÓÚÜÑ']/g, '');
    if (!clean || clean.length < 2) return [];

    const raw: string[] = this.spell.suggest(clean);

    // Capitalizar si la palabra original estaba en mayúscula inicial
    const firstIsUpper = word.length > 0
      && word[0] === word[0].toUpperCase()
      && word[0] !== word[0].toLowerCase();

    return firstIsUpper
      ? raw.map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).slice(0, 6)
      : raw.slice(0, 6);
  }
}
