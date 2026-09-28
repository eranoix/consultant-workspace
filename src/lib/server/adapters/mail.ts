import type { Db } from '../db';

export interface MailMessage {
  uid: number;
  folder: string;
  messageId: string;
  threadId: string | null;
  fromEmail: string;
  fromName: string | null;
  to: string[];
  subject: string;
  text: string;
  html: string | null;
  receivedAt: Date;
}

export interface MailProvider {
  name: string;
  folders(prefix: string): Promise<string[]>;
  fetch(folder: string, afterUid: number, limit?: number): Promise<MailMessage[]>;
  fetchTree(prefix: string): Promise<MailMessage[]>;
}

interface Row {
  uid: string;
  folder: string;
  message_id: string;
  thread_id: string | null;
  from_email: string;
  from_name: string | null;
  to_emails: string[];
  subject: string;
  body_text: string;
  body_html: string | null;
  received_at: Date;
}

function toMessage(r: Row): MailMessage {
  return {
    uid: Number(r.uid),
    folder: r.folder,
    messageId: r.message_id,
    threadId: r.thread_id,
    fromEmail: r.from_email,
    fromName: r.from_name,
    to: r.to_emails,
    subject: r.subject,
    text: r.body_text,
    html: r.body_html,
    receivedAt: r.received_at,
  };
}

const COLS = 'uid, folder, message_id, thread_id, from_email, from_name, to_emails, subject, body_text, body_html, received_at';

export class MockMail implements MailProvider {
  name = 'mock';
  constructor(private db: Db) {}

  async folders(prefix: string): Promise<string[]> {
    const { rows } = await this.db.query<{ folder: string }>(
      'SELECT DISTINCT folder FROM mock_mailbox WHERE folder = $1 OR folder LIKE $2 ORDER BY folder',
      [prefix, `${prefix}/%`],
    );
    return rows.map((r) => r.folder);
  }

  async fetch(folder: string, afterUid: number, limit = 200): Promise<MailMessage[]> {
    const { rows } = await this.db.query<Row>(
      `SELECT ${COLS} FROM mock_mailbox WHERE folder = $1 AND uid > $2 ORDER BY uid LIMIT $3`,
      [folder, afterUid, limit],
    );
    return rows.map(toMessage);
  }

  async fetchTree(prefix: string): Promise<MailMessage[]> {
    const { rows } = await this.db.query<Row>(
      `SELECT ${COLS} FROM mock_mailbox
        WHERE lower(replace(folder, '.', '/')) = lower($1) OR lower(replace(folder, '.', '/')) LIKE lower($1) || '/%'
        ORDER BY uid`,
      [prefix],
    );
    return rows.map(toMessage);
  }
}

export class ImapMail implements MailProvider {
  name = 'imap';
  constructor(host: string, user: string) {
    if (!host || !user) throw new Error('IMAP is not configured (IMAP_HOST, IMAP_USER, IMAP_PASSWORD)');
  }
  private unsupported(): never {
    throw new Error('The IMAP adapter needs an IMAP client library wired in; set MAIL_PROVIDER=mock to use the demo mailbox');
  }
  async folders(): Promise<string[]> {
    return this.unsupported();
  }
  async fetch(): Promise<MailMessage[]> {
    return this.unsupported();
  }
  async fetchTree(): Promise<MailMessage[]> {
    return this.unsupported();
  }
}

export function mailProvider(db: Db, env: NodeJS.ProcessEnv = process.env): MailProvider {
  if (env.MAIL_PROVIDER === 'imap') return new ImapMail(env.IMAP_HOST ?? '', env.IMAP_USER ?? '');
  return new MockMail(db);
}

export function normalizeFolderPath(raw: string): string {
  return raw
    .replace(/[.\\]/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('/');
}
