import { cookies } from 'next/headers';
import { isLocale, makeT, type T } from './translate';
import type { Locale } from './catalog';

export const LOCALE_COOKIE = 'cw_locale';

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const v = jar.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : 'en';
}

export async function getT(): Promise<{ t: T; locale: Locale }> {
  const locale = await getLocale();
  return { t: makeT(locale), locale };
}
