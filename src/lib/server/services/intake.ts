/**
 * Intake: meetings and emails become sources with a summary and candidate
 * tasks. Nothing here touches the board; that only happens when a person
 * completes a review (see approvals.ts).
 */
import type { PoolClient } from 'pg';
import type { Db } from '../db';
import { tx } from '../db';
import { inferSide } from '@/lib/domain/side';
import { domainOf } from '@/lib/domain/side';
import { summarizer, type Summarizer } from '../llm';
import { mailProvider, type MailMessage } from '../adapters/mail';
import { getSetting, getSettings, putSetting } from '../settings';
import { inferContext } from './clients';
import { emit } from './alerts';

export interface SourceDraft {
  kind: 'meeting' | 'email';
  externalId?: string | null;
  title: string;
  body: string;
  fromEmail?: string | null;
  fromName?: string | null;
  participants?: string[];
  threadId?: string | null;
  direction?: 'inbound' | 'outbound';
  occurredAt: Date;
}

export async function ingest(
  db: PoolClient,
  draft: SourceDraft,
  llm: Summarizer = summarizer(),
): Promise<{ id: string; created: boolean }> {
  if (draft.externalId) {
    const existing = await db.query<{ id: string }>('SELECT id FROM sources WHERE external_id = $1', [draft.externalId]);
    if (existing.rows[0]) return { id: existing.rows[0].id, created: false };
  }
  const ctx = await inferContext(db);
  const inf = inferSide(
    { fromEmail: draft.fromEmail, participants: draft.participants, title: draft.title, body: draft.body },
    ctx,
  );
  const summary = await llm.summarize({ kind: draft.kind, title: draft.title, body: draft.body, occurredAt: draft.occurredAt });
  const participants = draft.participants?.length ? draft.participants : summary.participants;
  const outbound = draft.direction === 'outbound';
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO sources (kind, external_id, title, body, from_email, from_name, participants, thread_id, direction,
                          occurred_at, client_id, side, side_reason, summary, summarized_at, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now(), $15) RETURNING id`,
    [
      draft.kind,
      draft.externalId ?? null,
      draft.title,
      draft.body,
      draft.fromEmail ?? null,
      draft.fromName ?? null,
      participants,
      draft.threadId ?? null,
      draft.direction ?? 'inbound',
      draft.occurredAt,
      inf.clientId,
      inf.side,
      inf.reason,
      JSON.stringify({ summary: summary.summary, topics: summary.topics, keyDecisions: summary.keyDecisions, provider: summary.provider }),
      // Outbound mail is a record of the thread, not a request for work.
      outbound || summary.tasks.length === 0 ? 'reviewed' : 'pending',
    ],
  );
  const id = rows[0]!.id;
  if (!outbound) {
    let pos = 0;
    for (const t of summary.tasks) {
      await db.query(
        `INSERT INTO candidate_tasks (source_id, title, details, client_id, side, due_date, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, t.title, t.details, inf.clientId, inf.side, t.dueDate, pos++],
      );
    }
  }
  return { id, created: true };
}

function messageToDraft(m: MailMessage, kind: 'meeting' | 'email', ownDomains: string[]): SourceDraft {
  const fromDomain = domainOf(m.fromEmail);
  const outbound = !!fromDomain && ownDomains.includes(fromDomain);
  return {
    kind,
    externalId: m.messageId,
    title: m.subject,
    body: m.text,
    fromEmail: m.fromEmail,
    fromName: m.fromName,
    // Meeting notes arrive from a note-taker; the attendees are the recipients.
    participants: kind === 'email' ? [m.fromEmail, ...m.to] : m.to,
    threadId: m.threadId,
    direction: kind === 'email' && outbound ? 'outbound' : 'inbound',
    occurredAt: m.receivedAt,
  };
}

/**
 * One intake pass over a mail folder: INBOX for emails, "Meetings" for the
 * notes a note-taker sends after each call. A cursor per channel keeps passes
 * incremental; the run is recorded for the intake health panel either way.
 */
export async function runMailIntake(db: Db, channel: 'email' | 'meeting'): Promise<{ fetched: number; created: number; skipped: number }> {
  // Sent mail is read too: a reply is what closes an "unanswered" thread.
  const folders = channel === 'email' ? ['INBOX', 'Sent'] : ['Meetings'];
  const run = await db.query<{ id: string }>('INSERT INTO intake_runs (channel) VALUES ($1) RETURNING id', [channel]);
  const runId = run.rows[0]!.id;
  try {
    const settings = await getSettings(db);
    const provider = mailProvider(db);
    let fetched = 0;
    let created = 0;
    let skipped = 0;
    for (const folder of folders) {
      const cursorKey = `intake.cursor.${folder.toLowerCase()}`;
      const cursor = await getSetting<number>(db, cursorKey, 0);
      const messages = await provider.fetch(folder, cursor);
      fetched += messages.length;
      let maxUid = cursor;
      for (const m of messages) {
        const res = await tx((client) => ingest(client, messageToDraft(m, channel, settings.profile.ownDomains)));
        maxUid = Math.max(maxUid, m.uid);
        if (!res.created) {
          skipped += 1;
          continue;
        }
        created += 1;
        if (channel === 'email' && folder === 'INBOX') await emitReceived(db, res.id, m);
      }
      await putSetting(db, cursorKey, maxUid);
    }
    await db.query('UPDATE intake_runs SET finished_at = now(), fetched = $2, created = $3, skipped = $4 WHERE id = $1', [
      runId,
      fetched,
      created,
      skipped,
    ]);
    return { fetched, created, skipped };
  } catch (err) {
    await db.query('UPDATE intake_runs SET finished_at = now(), error = $2 WHERE id = $1', [runId, (err as Error).message]);
    throw err;
  }
}

async function emitReceived(db: Db, sourceId: string, m: MailMessage) {
  const src = await db.query<{ client: string | null; side: string | null; thread_size: number }>(
    `SELECT c.name AS client, s.side,
            (SELECT count(*)::int FROM sources x WHERE x.thread_id IS NOT NULL AND x.thread_id = s.thread_id) AS thread_size
       FROM sources s LEFT JOIN clients c ON c.id = s.client_id WHERE s.id = $1`,
    [sourceId],
  );
  const row = src.rows[0];
  await emit(
    db,
    'email.received',
    {
      from_email: m.fromEmail,
      from_domain: domainOf(m.fromEmail),
      subject: m.subject,
      client: row?.client ?? null,
      side: row?.side ?? null,
      thread_size: row?.thread_size ?? 1,
    },
    { type: 'source', id: sourceId, label: m.subject },
  );
}
