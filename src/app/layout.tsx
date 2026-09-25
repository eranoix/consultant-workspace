import type { Metadata } from 'next';
import '@fontsource-variable/inter';
import './globals.css';
import { getLocale } from '@/i18n/server';
import { I18nProvider } from '@/i18n/client';

export const metadata: Metadata = {
  title: { default: 'Consultant Workspace', template: '%s · Consultant Workspace' },
  description: 'One workspace for an independent consultant: bookings, meetings and emails turned into tasks, a task board, a weekly timeline and alerts.',
  icons: { icon: '/icon.svg' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale === 'pt' ? 'pt-BR' : 'en'}>
      <body className="min-h-screen font-sans">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
