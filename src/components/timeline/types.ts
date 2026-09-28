export interface Entry {
  id: string;
  task_id: string | null;
  title: string;
  starts_at: string;
  duration_min: number;
  side: 'partner' | 'direct' | null;
  client_id: string | null;
  client_name: string | null;
  client_color: string | null;
  notes: string | null;
  task_status: string | null;
  synced: boolean;
}

export interface WeekReport {
  totalMin: number;
  bySide: { partner: number; direct: number; unassigned: number };
  byClient: { name: string; side: string | null; minutes: number }[];
  byDay: { date: string; minutes: number }[];
  merged: number;
  warnings: { kind: string; message: string }[];
}

export interface WeekData {
  week: string;
  today: string;
  timeZone: string;
  entries: Entry[];
  state: {
    processed_at: string | null;
    report: WeekReport | null;
    synced_at: string | null;
    sync_result: { created: number; updated: number; unchanged: number; deleted: number; calendar: string } | null;
  };
}

export function layoutLanes<T extends { id: string; start: number; end: number }>(items: T[]): Map<string, { lane: number; lanes: number }> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = new Map<string, { lane: number; lanes: number }>();
  let group: T[] = [];
  let groupEnd = -Infinity;
  const laneEnds: number[] = [];
  const flush = () => {
    const lanes = Math.max(1, ...group.map((g) => (out.get(g.id)?.lane ?? 0) + 1));
    for (const g of group) out.set(g.id, { lane: out.get(g.id)!.lane, lanes });
    group = [];
    laneEnds.length = 0;
  };
  for (const it of sorted) {
    if (it.start >= groupEnd && group.length) flush();
    let lane = laneEnds.findIndex((end) => end <= it.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = it.end;
    out.set(it.id, { lane, lanes: 1 });
    group.push(it);
    groupEnd = Math.max(groupEnd === -Infinity ? it.end : groupEnd, it.end);
  }
  if (group.length) flush();
  return out;
}
