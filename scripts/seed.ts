import { loadEnv } from './env';

loadEnv();
if (process.env.DATABASE_ADMIN_URL) process.env.DATABASE_URL = process.env.DATABASE_ADMIN_URL;

import { pool, tx } from '../src/lib/server/db';
import { hashPassword } from '../src/lib/server/password';
import { CLIENTS, EMAILS, MAIL_NOTES, MEETINGS, PEOPLE } from './seed-data';
import { DEFAULT_SETTINGS, putSetting } from '../src/lib/server/settings';
import { runMailIntake } from '../src/lib/server/services/intake';
import { completeReview, decide } from '../src/lib/server/services/approvals';
import { createTask, moveTask, updateTask } from '../src/lib/server/services/board';
import { createEntry, processWeek, syncWeek } from '../src/lib/server/services/timeline';
import { createGoal, ensureOccurrences } from '../src/lib/server/services/goals';
import { createFolder, createNote, syncNotesFromMail, updateNote } from '../src/lib/server/services/notes';
import { evaluateScheduled, saveRule, deliverOutbox } from '../src/lib/server/services/alerts';
import { registerJobs } from '../src/lib/server/services/cron';
import { createToken } from '../src/lib/server/services/tokens';
import { connect } from '../src/lib/server/services/integrations';
import { addDays, dateInZone, mondayOf, zonedTimeToUtc } from '../src/lib/domain/time';
import { randomBytes } from 'node:crypto';

const TZ = DEFAULT_SETTINGS.profile.timeZone;
const now = new Date();
const today = dateInZone(now.getTime(), TZ);
const at = (dayOffset: number, hhmm: string) => new Date(zonedTimeToUtc(addDays(today, dayOffset), hhmm, TZ));
const bizDay = (n: number) => {
  let offset = 0;
  let left = Math.abs(n);
  while (left > 0) {
    offset += Math.sign(n);
    const wd = new Date(`${addDays(today, offset)}T12:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return offset;
};
const hh = (h: number, m = 0) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

const APP_TABLES = [
  'users', 'workspace_settings', 'clients', 'side_overrides', 'user_preferences', 'mock_mailbox', 'sources', 'candidate_tasks',
  'intake_runs', 'api_tokens', 'tasks', 'calendar_accounts', 'mock_calendar_events', 'timeline_entries', 'timeline_weeks',
  'calendar_sync_links', 'goals', 'goal_occurrences', 'note_folders', 'notes', 'alert_rules', 'alerts', 'notification_outbox',
  'cron_jobs', 'job_runs', 'services', 'availability_rules', 'availability_exceptions', 'bookings', 'integration_credentials',
];

async function main() {
  const db = pool();
  if (process.argv.includes('--if-empty')) {
    const done = await db.query("SELECT 1 FROM workspace_settings WHERE key = 'seed.completed'");
    if (done.rowCount) {
      console.log('seed: already seeded, nothing to do');
      return;
    }
  }
  await db.query(`TRUNCATE ${APP_TABLES.join(', ')} RESTART IDENTITY CASCADE`);

  const password = process.env.DEMO_PASSWORD || 'workspace-demo';
  const users: Record<string, string> = {};
  for (const [key, role] of [['maya', 'owner'], ['theo', 'admin']] as const) {
    const p = PEOPLE[key];
    const { rows } = await db.query<{ id: string }>(
      'INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [p.email, p.name, await hashPassword(password), role],
    );
    users[key] = rows[0]!.id;
  }
  const maya = users.maya!;
  const theo = users.theo!;
  await putSetting(db, 'profile', DEFAULT_SETTINGS.profile);
  await putSetting(db, 'partner', DEFAULT_SETTINGS.partner);
  await putSetting(db, 'workday', DEFAULT_SETTINGS.workday);

  const clientIds: Record<string, string> = {};
  for (const c of CLIENTS) {
    const { rows } = await db.query<{ id: string }>(
      'INSERT INTO clients (name, aliases, domains, side, engagement, color) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [c.name, c.aliases, c.domains, c.side, c.engagement, c.color],
    );
    clientIds[c.key] = rows[0]!.id;
  }
  await db.query("INSERT INTO side_overrides (kind, pattern, side, client_id, note) VALUES ('sender', $1, 'direct', $2, $3)", [
    PEOPLE.samPersonal.email,
    clientIds.northlight,
    'Sam writes from a personal address when traveling',
  ]);
  await db.query("INSERT INTO side_overrides (kind, pattern, side, client_id, note) VALUES ('keyword', 'Dayton warehouse', 'partner', $1, $2)", [
    clientIds.brightwater,
    'The Dayton site is always Brightwater',
  ]);

  const rules: [string, Parameters<typeof saveRule>[2], boolean][] = [
    ['Scheduled job {job} is late', { event: 'cron.late', severity: 'critical', channels: ['outbox', 'whatsapp'], cooldownMin: 30, description: 'Raised by the dead-man switch, or by the job that watches it.' }, true],
    ['Intake stalled: {channel}', { event: 'intake.stalled', severity: 'critical', channels: ['outbox', 'email'], conditions: [{ field: 'hours_since_success', op: 'gt', value: '6' }], description: 'No successful intake run for six hours.' }, true],
    ['Unanswered client email: {subject}', { event: 'email.unanswered', severity: 'warning', channels: ['outbox', 'email'], conditions: [{ field: 'side', op: 'equals', value: 'direct' }, { field: 'hours_unanswered', op: 'gt', value: '24' }], description: 'Own clients should hear back within a day.' }, false],
    ['Partner email waiting: {subject}', { event: 'email.unanswered', severity: 'info', conditions: [{ field: 'side', op: 'equals', value: 'partner' }, { field: 'hours_unanswered', op: 'gte', value: '48' }], description: 'Partner firm threads, two business days.' }, false],
    ['Overdue: {title}', { event: 'task.overdue', severity: 'warning', conditions: [{ field: 'days_overdue', op: 'gte', value: '1' }] }, false],
    ['High priority due today: {title}', { event: 'task.due_today', severity: 'info', conditions: [{ field: 'priority', op: 'equals', value: 'high' }] }, false],
    ['Urgent email from {client}', { event: 'email.received', severity: 'critical', channels: ['outbox', 'whatsapp'], match: 'all', conditions: [{ field: 'subject', op: 'contains', value: 'urgent' }, { field: 'side', op: 'in', value: 'partner,direct' }], description: 'Anything marked urgent by a client.' }, false],
    ['New booking: {service}', { event: 'booking.created', severity: 'info', description: 'Someone booked through the public page.' }, false],
  ];
  for (const [name, input, system] of rules) {
    const id = await saveRule(db, null, { name, ...input });
    if (system) await db.query('UPDATE alert_rules SET system = true WHERE id = $1', [id]);
  }

  const mail: { folder: string; id: string; thread: string | null; from: { name: string; email: string }; to: string[]; subject: string; body: string; at: Date }[] = [];
  for (const e of EMAILS) {
    mail.push({ folder: 'INBOX', id: `${e.thread}-1@mail.example.com`, thread: e.thread, from: e.from, to: e.to, subject: e.subject, body: e.body, at: at(e.day, hh(e.hour)) });
    if (e.reply) {
      const when = new Date(at(e.day, hh(e.hour)).getTime() + e.reply.afterHours * 3600_000);
      mail.push({ folder: 'Sent', id: `${e.thread}-2@mail.example.com`, thread: e.thread, from: PEOPLE.maya, to: [e.from.email], subject: `Re: ${e.subject.replace(/^Re: /, '')}`, body: e.reply.body, at: when });
    }
  }
  for (const m of MEETINGS) {
    mail.push({
      folder: 'Meetings',
      id: `meeting-${m.day}-${m.hour}@notes.example.com`,
      thread: null,
      from: { name: 'Meeting notes', email: 'notes@notetaker.example.com' },
      to: m.to,
      subject: m.title,
      body: m.body,
      at: at(m.day, hh(m.hour + 1)),
    });
  }
  for (const n of MAIL_NOTES) {
    mail.push({ folder: n.folder, id: `note-${n.subject.toLowerCase().replace(/\W+/g, '-')}@mail.example.com`, thread: null, from: PEOPLE.maya, to: [PEOPLE.maya.email], subject: n.subject, body: n.body, at: at(n.day, '07:30') });
  }
  mail.sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const m of mail) {
    await db.query(
      `INSERT INTO mock_mailbox (folder, message_id, thread_id, from_email, from_name, to_emails, subject, body_text, received_at, modified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())`,
      [m.folder, m.id, m.thread, m.from.email, m.from.name, m.to, m.subject, m.body, m.at],
    );
  }
  await runMailIntake(db, 'meeting');
  await runMailIntake(db, 'email');
  await syncNotesFromMail(db);
  await db.query(`UPDATE intake_runs SET started_at = now() - interval '2 minutes', finished_at = now() - interval '2 minutes'`);
  for (let i = 1; i <= 24; i += 1) {
    for (const ch of ['email', 'meeting', 'notes']) {
      await db.query(
        `INSERT INTO intake_runs (channel, started_at, finished_at, fetched, created, skipped, error)
         VALUES ($1, now() - make_interval(hours => $2), now() - make_interval(hours => $2) + interval '3 seconds', $3, 0, 0, $4)`,
        [ch, i, i % 7 === 0 ? 1 : 0, ch === 'email' && i === 9 ? 'IMAP timeout after 30s (retried next run)' : null],
      );
    }
  }

  const plans = new Map<string, { decisions?: ('a' | 'n')[]; done?: boolean; day: number }>();
  for (const m of MEETINGS) plans.set(m.title, { ...m.plan, day: m.day });
  for (const e of EMAILS) plans.set(e.subject, { ...e.plan, day: e.day });
  const { rows: sources } = await db.query<{ id: string; title: string; status: string }>("SELECT id, title, status FROM sources WHERE direction = 'inbound'");
  for (const s of sources) {
    const plan = plans.get(s.title);
    if (!plan || s.status === 'reviewed') continue;
    const { rows: cands } = await db.query<{ id: string }>('SELECT id FROM candidate_tasks WHERE source_id = $1 ORDER BY position', [s.id]);
    await tx(async (c) => {
      for (let i = 0; i < cands.length; i += 1) {
        const d = plan.decisions?.[i] ?? (plan.done ? 'n' : undefined);
        if (d) await decide(c, cands[i]!.id, d === 'a' ? 'approved' : 'no_action', maya);
      }
      if (plan.done) await completeReview(c, s.id, maya);
    });
    if (plan.done) {
      const when = at(Math.min(plan.day + 1, 0), '08:40');
      await db.query('UPDATE sources SET reviewed_at = $2 WHERE id = $1', [s.id, when]);
      await db.query('UPDATE candidate_tasks SET decided_at = $2 WHERE source_id = $1 AND decision <> $3', [s.id, when, 'pending']);
      await db.query('UPDATE tasks SET created_at = $2 WHERE source_id = $1', [s.id, when]);
    }
  }

  const byTitle = async (title: string) =>
    (await db.query<{ id: string }>('SELECT id FROM tasks WHERE title ILIKE $1 LIMIT 1', [`${title}%`])).rows[0]?.id;
  const place: [string, 'todo' | 'doing' | 'review' | 'done', number | null, 'low' | 'normal' | 'high', number | null][] = [
    ['Map the current picking flow', 'done', -16, 'normal', 180],
    ['Draft the pilot success criteria', 'done', -19, 'high', 90],
    ['Send a proposal for the hiring process work', 'done', -20, 'high', 120],
    ['Schedule shadowing sessions', 'done', -15, 'normal', 30],
    ['Prepare the audit interview guide', 'done', -14, 'normal', 120],
    ['Draft the receiving checklist', 'done', -10, 'normal', 90],
    ['Write the pilot training one-pager', 'done', -12, 'high', 60],
    ['Set up the pilot metrics sheet', 'review', -1, 'normal', 60],
    ["Send last month's timesheet", 'done', -12, 'high', 30],
    ['Design the interview scorecard', 'done', -6, 'high', 150],
    ['Write interviewer briefing notes', 'doing', 1, 'normal', 90],
    ['Write up the shadowing findings', 'review', -2, 'high', 120],
    ['Estimate front desk time saved per intake', 'doing', 0, 'high', 90],
    ['Write the supplier delivery policy', 'todo', 3, 'normal', 60],
    ['Check whether the aisle codes match the map you drew', 'done', -19, 'normal', 30],
    ['Send the contract and the first invoice', 'done', -18, 'normal', 20],
    ['Add the Kestrel shadowing hours to last week', 'done', -15, 'normal', 15],
    ['Flag the ones that should get the new receiving window first', 'done', -12, 'low', 30],
    ['Prepare the interview kits for both roles', 'todo', 4, 'high', 180],
  ];
  for (const [title, status, due, priority, estimate] of place) {
    const id = await byTitle(title);
    if (!id) {
      console.warn(`seed: no board task "${title}"`);
      continue;
    }
    await updateTask(db, id, { dueDate: due === null ? null : addDays(today, due), priority, estimateMin: estimate });
    await moveTask(db, id, status);
  }
  await db.query("UPDATE tasks SET completed_at = (due_date + time '16:30') AT TIME ZONE $1 WHERE status = 'done' AND due_date IS NOT NULL", [TZ]);

  const manual: [string, string, keyof typeof clientIds | null, 'partner' | 'direct' | null, 'backlog' | 'todo' | 'doing' | 'review' | 'done', number | null, 'low' | 'normal' | 'high'][] = [
    ['Renew professional liability insurance', 'Policy renews at the end of the month.', null, 'direct', 'todo', -1, 'high'],
    ['Update the services page with the hiring offer', '', 'northlight', null, 'backlog', 9, 'normal'],
    ['Prepare Brightwater week 2 pilot report', 'Mispick rate and lines per hour, with the scanner battery note.', 'brightwater', null, 'todo', 0, 'high'],
    ['Book travel for the Kestrel board presentation', '', 'kestrel', null, 'backlog', 2, 'normal'],
    ['Quarterly tax estimate', 'Send numbers to the accountant.', null, 'direct', 'backlog', 12, 'normal'],
    ['Archive old Harbor & Vale timesheets', '', null, 'partner', 'backlog', null, 'low'],
  ];
  for (const [title, description, client, side, status, due, priority] of manual) {
    const t = await createTask(
      db,
      { title, description, status, clientId: client ? clientIds[client] : null, side, dueDate: due === null ? null : addDays(today, due), priority, estimateMin: 60 },
      { userId: maya },
    );
    void t;
  }

  const theoToken = await createToken(db, { name: 'Theo: board helper', role: 'contributor' }, maya);
  await createToken(db, { name: 'Weekly report script', role: 'viewer' }, maya);
  const old = await createToken(db, { name: 'Old laptop', role: 'manager' }, maya);
  await db.query("UPDATE api_tokens SET revoked_at = now() - interval '9 days', created_at = now() - interval '40 days' WHERE id = $1", [old.id]);
  for (const [title, status, client] of [
    ['Order printer labels for aisle 2', 'todo', 'brightwater'],
    ['Collect receipts for Kestrel travel', 'backlog', 'kestrel'],
  ] as const) {
    await createTask(db, { title, description: 'Added through the board API.', status, clientId: clientIds[client], priority: 'normal' }, { tokenId: theoToken.id, origin: 'api' });
  }
  await db.query("UPDATE api_tokens SET last_used_at = now() - interval '3 hours' WHERE id = $1", [theoToken.id]);

  const { rows: cals } = await db.query<{ id: string; side: string }>(
    `INSERT INTO calendar_accounts (label, provider, external_id, side, is_timeline_target) VALUES
       ('Lumen Advisory calendar', 'mock', 'maya-own', 'direct', false),
       ('Harbor & Vale calendar', 'mock', 'maya-harborvale', 'partner', true)
     RETURNING id, side`,
  );
  const ownCal = cals.find((c) => c.side === 'direct')!.id;
  const partnerCal = cals.find((c) => c.side === 'partner')!.id;
  for (let wd = 1; wd <= 5; wd += 1) {
    await db.query("INSERT INTO availability_rules (weekday, start_time, end_time) VALUES ($1, '09:00', '12:00'), ($1, '13:00', '17:00')", [wd]);
  }
  const monday = mondayOf(today);
  await db.query("INSERT INTO availability_exceptions (date, kind, note) VALUES ($1, 'closed', 'Offsite with Harbor & Vale')", [addDays(monday, 11)]);
  await db.query(`INSERT INTO availability_exceptions (date, kind, windows, note) VALUES ($1, 'open', '[{"start":"09:00","end":"12:00"}]', 'Saturday clinic for small businesses')`, [addDays(monday, 12)]);
  const { rows: svc } = await db.query<{ id: string; slug: string }>(
    `INSERT INTO services (slug, name, description, duration_min, step_min, buffer_after_min, min_notice_min, max_advance_days, calendar_account_id, price_label, position) VALUES
      ('intro-call', 'Discovery call', 'A free 30 minute call to see whether an engagement makes sense.', 30, 30, 0, 240, 21, $1, 'Free', 1),
      ('working-session', 'Process working session', 'Ninety minutes mapping one process with your team, remote.', 90, 60, 30, 1440, 30, $1, '$450', 2),
      ('partner-sync', 'Harbor & Vale project sync', 'For Harbor & Vale colleagues: book project time on the partner calendar.', 45, 30, 15, 120, 14, $2, NULL, 3)
     RETURNING id, slug`,
    [ownCal, partnerCal],
  );
  const svcId = (slug: string) => svc.find((s) => s.slug === slug)!.id;
  const busy: [string, number, string, number, string][] = [
    ['maya-harborvale', 1, '10:00', 60, 'Kestrel steering group'],
    ['maya-harborvale', 2, '14:00', 90, 'Brightwater pilot review'],
    ['maya-harborvale', 3, '09:00', 60, 'Harbor & Vale partner sync'],
    ['maya-own', 1, '15:00', 60, 'Dentist'],
    ['maya-own', 4, '11:00', 60, 'Northlight calibration'],
    ['maya-harborvale', 7, '10:00', 120, 'Kestrel board presentation'],
  ];
  for (const [cal, day, time, dur, title] of busy) {
    const s = at(bizDay(day), time);
    await db.query('INSERT INTO mock_calendar_events (calendar_id, title, starts_at, ends_at, busy) VALUES ($1,$2,$3,$4,true)', [cal, title, s, new Date(s.getTime() + dur * 60_000)]);
  }
  const bookings: [string, number, string, number, string, string, string | null][] = [
    ['intro-call', -9, '10:00', 30, 'Jordan Ellis', 'jordan@fernbrook.example.com', 'Fernbrook Bakery'],
    ['working-session', -5, '13:00', 90, 'Sam Rivera', PEOPLE.sam.email, 'Northlight Studio'],
    ['intro-call', 1, '09:30', 30, 'Aisha Mensah', 'aisha@tidewater.example.com', 'Tidewater Clinics'],
    ['partner-sync', 2, '10:00', 45, 'Priya Raman', PEOPLE.priya.email, 'Harbor & Vale'],
    ['working-session', 3, '13:00', 90, 'Grace Liu', PEOPLE.grace.email, 'Orchard & Pine Foods'],
    ['intro-call', 6, '16:00', 30, 'Ben Okoro', 'ben@quarrylane.example.com', null],
  ];
  for (const [slug, day, time, dur, name, email, company] of bookings) {
    const s = at(bizDay(day), time);
    const e = new Date(s.getTime() + dur * 60_000);
    const buffer = slug === 'working-session' ? 30 : slug === 'partner-sync' ? 15 : 0;
    await db.query(
      `INSERT INTO bookings (service_id, starts_at, ends_at, reserved_until, customer_name, customer_email, company, manage_token, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, $2::timestamptz - interval '3 days')`,
      [svcId(slug), s, e, new Date(e.getTime() + buffer * 60_000), name, email, company, randomBytes(18).toString('base64url')],
    );
  }

  const taskId = async (t: string) => (await byTitle(t)) ?? null;
  type Block = [number, string, number, string, string | null, keyof typeof clientIds | null];
  const weekPattern: Block[] = [
    [0, '08:30', 30, 'Inbox and approvals', null, null],
    [0, '09:00', 120, 'Brightwater pilot floor time', 'Set up the pilot metrics sheet', 'brightwater'],
    [0, '11:00', 60, 'Kestrel interviews', 'Write up the shadowing findings', 'kestrel'],
    [0, '13:30', 90, 'Northlight scorecard', 'Write interviewer briefing notes', 'northlight'],
    [0, '15:30', 60, 'Orchard & Pine checklist', 'Write the supplier delivery policy', 'orchard'],
    [1, '09:00', 180, 'Kestrel clinic shadowing', 'Estimate front desk time saved per intake', 'kestrel'],
    [1, '13:00', 90, 'Brightwater data review', 'Set up the pilot metrics sheet', 'brightwater'],
    [1, '14:30', 45, 'Harbor & Vale timesheet', null, null],
    [2, '08:30', 30, 'Inbox and approvals', null, null],
    [2, '09:00', 120, 'Orchard & Pine site visit', 'Write the supplier delivery policy', 'orchard'],
    [2, '13:00', 120, 'Brightwater pilot floor time', 'Set up the pilot metrics sheet', 'brightwater'],
    [2, '15:00', 60, 'Northlight interview kits', 'Prepare the interview kits for both roles', 'northlight'],
    [3, '09:00', 90, 'Kestrel recommendations', 'Write up the shadowing findings', 'kestrel'],
    [3, '10:30', 60, 'Kestrel recommendations', 'Write up the shadowing findings', 'kestrel'],
    [3, '13:30', 120, 'Northlight calibration prep', 'Write interviewer briefing notes', 'northlight'],
    [4, '09:00', 60, 'Brightwater week report', 'Prepare Brightwater week 2 pilot report', 'brightwater'],
    [4, '10:00', 90, 'Orchard & Pine playbook', 'Write the supplier delivery policy', 'orchard'],
    [4, '14:00', 60, 'Process the week', null, null],
  ];
  const partnerNoClient = new Set(['Harbor & Vale timesheet']);
  for (const w of [-14, -7, 0]) {
    const ws = addDays(monday, w);
    for (const [d, time, dur, title, task, client] of weekPattern) {
      const date = addDays(ws, d);
      if (w === 0 && date > today) continue;
      const startsAt = new Date(zonedTimeToUtc(date, time, TZ));
      if (w === 0 && date === today && startsAt.getTime() > now.getTime() && time > '11:00') continue;
      await createEntry(
        db,
        {
          taskId: task ? await taskId(task) : null,
          title,
          startsAt: startsAt.toISOString(),
          durationMin: dur,
          clientId: client ? clientIds[client] : null,
          side: partnerNoClient.has(title) ? 'partner' : client ? undefined : 'direct',
        },
        w === 0 && d % 2 ? theo : maya,
      );
    }
    if (w < 0) {
      await tx((c) => processWeek(c, ws, TZ, maya));
      await tx((c) => syncWeek(c, ws, TZ));
    }
  }
  await tx((c) => syncWeek(c, monday, TZ));
  if (today > monday) {
    await createEntry(db, { title: 'Proposal edits for Northlight', startsAt: at(-1, '16:30').toISOString(), durationMin: 30, clientId: clientIds.northlight }, maya);
  }
  await createEntry(db, { title: 'Brightwater stand-up', startsAt: at(0, '08:00').toISOString(), durationMin: 15, clientId: clientIds.brightwater }, maya);

  const start = addDays(today, -21);
  const o1 = await createGoal(db, { title: 'Grow the own practice to 40% of billed hours', side: 'direct', startsOn: start, dueOn: addDays(today, 70) });
  await createGoal(db, { parentId: o1, title: 'Send a client update every Friday', side: 'direct', rrule: 'FREQ=WEEKLY;BYDAY=FR', startsOn: start });
  await createGoal(db, { parentId: o1, title: 'Two discovery calls a week', side: 'direct', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH', startsOn: start });
  await createGoal(db, { parentId: o1, title: 'Publish the Orchard & Pine case study', side: 'direct', clientId: clientIds.orchard, startsOn: start, dueOn: addDays(today, 9) });
  const o2 = await createGoal(db, { title: 'Land the Brightwater pilot on time', side: 'partner', clientId: clientIds.brightwater, startsOn: start, dueOn: addDays(today, 21) });
  await createGoal(db, { parentId: o2, title: 'Review pilot metrics every weekday', side: 'partner', clientId: clientIds.brightwater, rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', startsOn: addDays(today, -12) });
  await createGoal(db, { parentId: o2, title: 'Monday status note to Harbor & Vale', side: 'partner', rrule: 'FREQ=WEEKLY;BYDAY=MO', startsOn: start });
  const o3 = await createGoal(db, { title: 'Keep the admin under control', startsOn: start });
  await createGoal(db, { parentId: o3, title: 'Clear the approval queue', rrule: 'FREQ=DAILY', startsOn: addDays(today, -10) });
  await createGoal(db, { parentId: o3, title: 'Process my week', rrule: 'FREQ=WEEKLY;BYDAY=FR', startsOn: start });
  await ensureOccurrences(db, addDays(today, -21), addDays(today, 28));
  await db.query(
    `UPDATE goal_occurrences SET status = 'done', completed_at = (occurs_on + time '17:10') AT TIME ZONE $2
      WHERE occurs_on < $1::date AND (extract(doy FROM occurs_on)::int % 5) <> 0`,
    [today, TZ],
  );
  await db.query("UPDATE goal_occurrences SET status = 'skipped' WHERE occurs_on < $1::date AND status = 'open' AND (extract(doy FROM occurs_on)::int % 10) = 0", [today]);
  const { rows: todays } = await db.query<{ id: string }>('SELECT id FROM goal_occurrences WHERE occurs_on = $1 ORDER BY id', [today]);
  for (const [i, o] of todays.entries()) {
    if (i === 0) await db.query("UPDATE goal_occurrences SET status = 'done', completed_at = now() - interval '2 hours' WHERE id = $1", [o.id]);
    if (i === 1) await db.query("UPDATE goal_occurrences SET status = 'doing' WHERE id = $1", [o.id]);
  }

  const personal = await createFolder(db, 'Practice', null);
  const n1 = await createNote(db, { folderId: personal, title: 'Pricing principles' });
  await updateNote(db, n1, {
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'How I price engagements' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Fixed price per phase, never open-ended hourly work for own clients. ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'Partner work is billed through Harbor & Vale.' }] },
        { type: 'bulletList', content: ['Discovery is free and capped at 30 minutes', 'Working sessions are sold in packs of three', 'Retainers only after a first delivered phase'].map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })) },
      ],
    },
    contentText: 'How I price engagements. Fixed price per phase. Partner work is billed through Harbor & Vale.',
    pinned: true,
  });
  const n2 = await createNote(db, { folderId: personal, title: 'Friday routine' });
  await updateNote(db, n2, {
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Before closing the week:' }] },
        { type: 'taskList', content: [['Clear the approval queue', true], ['Process my week on the timeline', true], ['Sync the week to the calendar', false], ['Send the client update', false]].map(([t, c]) => ({ type: 'taskItem', attrs: { checked: c }, content: [{ type: 'paragraph', content: [{ type: 'text', text: t as string }] }] })) },
      ],
    },
    contentText: 'Before closing the week: clear the approval queue, process my week, sync the week, send the client update.',
  });

  await registerJobs(db);
  await db.query(`UPDATE cron_jobs SET last_started_at = now() - interval '40 seconds', last_finished_at = now() - interval '38 seconds',
                         last_success_at = now() - interval '38 seconds', last_duration_ms = 120 + (random() * 900)::int,
                         run_count = 1400 + (random() * 300)::int, fail_count = CASE WHEN name = 'intake-email' THEN 3 ELSE 0 END`);
  await db.query(`UPDATE cron_jobs SET last_error_at = now() - interval '9 hours', last_error = 'IMAP timeout after 30s (retried next run)' WHERE name = 'intake-email'`);
  for (let i = 1; i <= 10; i += 1) {
    await db.query(
      `INSERT INTO job_runs (job, started_at, finished_at, ok, detail)
       SELECT name, now() - make_interval(secs => interval_sec * $1), now() - make_interval(secs => interval_sec * $1) + interval '1 second', true, '{}'::jsonb FROM cron_jobs`,
      [i],
    );
  }
  const { rows: cronRule } = await db.query<{ id: string }>("SELECT id FROM alert_rules WHERE event = 'cron.late'");
  await db.query(
    `INSERT INTO alerts (rule_id, severity, title, body, entity_type, entity_id, dedupe_key, status, created_at, resolved_at)
     VALUES ($1, 'critical', 'Scheduled job notes-sync is late', 'notes-sync is 22 min late', 'job', 'notes-sync', $2, 'resolved', now() - interval '3 days', now() - interval '3 days' + interval '25 minutes')`,
    [cronRule[0]!.id, `${cronRule[0]!.id}:job:notes-sync`],
  );

  await connect(maya, 'google-calendar', 'Own practice');
  await connect(maya, 'google-calendar', 'Partner firm');
  await connect(maya, 'mail', 'Inbox');

  await evaluateScheduled(db, now);
  await deliverOutbox(db);
  const { rows: live } = await db.query<{ id: string; title: string }>("SELECT id, title FROM alerts WHERE status = 'open' ORDER BY created_at");
  if (live[0]) await db.query("UPDATE alerts SET status = 'acknowledged' WHERE id = $1", [live[0].id]);

  await db.query(
    `INSERT INTO user_preferences (user_id, key, value) VALUES ($1, 'board.view', '{"side":"all","sort":"manual","client":""}')`,
    [maya],
  );
  await putSetting(db, 'seed.completed', { at: now.toISOString(), today });

  const counts = await db.query<{ t: string; n: number }>(
    `SELECT 'sources' AS t, count(*)::int AS n FROM sources WHERE direction = 'inbound' UNION ALL
     SELECT 'candidates', count(*)::int FROM candidate_tasks UNION ALL SELECT 'tasks', count(*)::int FROM tasks UNION ALL
     SELECT 'timeline', count(*)::int FROM timeline_entries UNION ALL SELECT 'goals', count(*)::int FROM goals UNION ALL
     SELECT 'notes', count(*)::int FROM notes UNION ALL SELECT 'alerts', count(*)::int FROM alerts UNION ALL
     SELECT 'bookings', count(*)::int FROM bookings`,
  );
  console.log('seed: done', Object.fromEntries(counts.rows.map((r) => [r.t, r.n])));
  console.log(`seed: sign in as ${PEOPLE.maya.email} / ${password}`);
}

main()
  .then(() => pool().end())
  .catch(async (err) => {
    console.error('seed failed:', err);
    await pool().end().catch(() => undefined);
    process.exit(1);
  });
