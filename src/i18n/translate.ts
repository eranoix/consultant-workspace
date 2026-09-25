import { messages, type Locale, type Messages } from './catalog';

export type TranslateVars = Record<string, string | number>;
export type T = (key: string, vars?: TranslateVars) => string;

function lookup(tree: Messages, key: string): string | undefined {
  let node: unknown = tree;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * `t('board.columns.todo')`, `t('approvals.pending', { count: 3 })`.
 *
 * Plurals use a `_one` / `_other` pair next to the key and pick by `count`.
 * A missing key falls back to English, then to the key itself: a visible key
 * on screen is easier to spot and fix than a blank.
 */
export function makeT(locale: Locale, catalog: Record<Locale, Messages> = messages): T {
  return (key, vars) => {
    let template: string | undefined;
    if (vars && typeof vars.count === 'number') {
      const suffix = vars.count === 1 ? '_one' : '_other';
      template = lookup(catalog[locale], key + suffix) ?? lookup(catalog.en, key + suffix);
    }
    template ??= lookup(catalog[locale], key) ?? lookup(catalog.en, key) ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
  };
}

export function isLocale(v: unknown): v is Locale {
  return v === 'en' || v === 'pt';
}
