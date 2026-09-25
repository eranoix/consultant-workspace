import { requireUser } from '@/lib/server/auth';
import { getSettings } from '@/lib/server/settings';
import { AppShell } from '@/components/shell/AppShell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await getSettings();
  return (
    <AppShell
      info={{
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        partnerShort: settings.partner.shortName,
        partnerName: settings.partner.name,
        practice: settings.profile.practice,
        timeZone: settings.profile.timeZone,
      }}
    >
      {children}
    </AppShell>
  );
}
