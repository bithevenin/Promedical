declare module 'nspell' {
  interface NSpell {
    correct(word: string): boolean;
    suggest(word: string): string[];
    add(word: string): this;
    remove(word: string): this;
  }
  function nspell(options: { aff: string; dic: string }): NSpell;
  function nspell(aff: string, dic: string): NSpell;
  export = nspell;
}
