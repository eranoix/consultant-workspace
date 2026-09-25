import { getSettings } from './settings';
import { dateInZone } from '@/lib/domain/time';

/** Today's date in the workspace time zone, for server components. */
export async function workspaceToday(): Promise<{ today: string; timeZone: string }> {
  const s = await getSettings();
  return { today: dateInZone(Date.now(), s.profile.timeZone), timeZone: s.profile.timeZone };
}
