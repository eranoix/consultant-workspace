import { getSettings } from './settings';
import { dateInZone } from '@/lib/domain/time';

export async function workspaceToday(): Promise<{ today: string; timeZone: string }> {
  const s = await getSettings();
  return { today: dateInZone(Date.now(), s.profile.timeZone), timeZone: s.profile.timeZone };
}
