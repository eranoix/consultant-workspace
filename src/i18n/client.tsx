'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Locale } from './catalog';
import { makeT, type T } from './translate';

const I18nContext = createContext<{ locale: Locale; t: T }>({ locale: 'en', t: makeT('en') });

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): T {
  return useContext(I18nContext).t;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}
