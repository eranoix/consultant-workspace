/**
 * Notes: nested folders, rich-text notes, and a one-way sync from a mail
 * folder ("Notes" and its subfolders), because that is where notes written
 * on a phone's mail app end up.
 *
 * The sync never deletes. A note that disappears upstream is flagged, not
 * removed: losing a note because a mailbox was reorganised is the one outcome
 * a notes feature cannot have.
 */
import type { PoolClient } from 'pg';
import type { Db } from '../db';
import { HttpError } from '../errors';
import { mailProvider, normalizeFolderPath } from '../adapters/mail';

export interface FolderRow {
  id: string;
  parent_id: string | null;
  name: string;
  position: number;
  mail_path: string | null;
  note_count: number;
}

export interface NoteListRow {
  id: string;
  folder_id: string | null;
  title: string;
  excerpt: string;
  origin: 'manual' | 'mail';
  pinned: boolean;
  missing_upstream_at: string | null;
  updated_at: string;
}

export async function listFolders(db: Db): Promise<FolderRow[]> {
  const { rows } = await db.query<FolderRow>(
    `SELECT f.id, f.parent_id, f.name, f.position, f.mail_path, (SELECT count(*)::int FROM notes n WHERE n.folder_id = f.id) AS note_count
       FROM note_folders f ORDER BY f.position, f.name`,
  );
  return rows;
}

export async function listNotes(db: Db, f: { folderId?: string | null; q?: string }): Promise<NoteListRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.folderId === 'none') where.push('folder_id IS NULL');
  else if (f.folderId) {
    params.push(f.folderId);
    where.push(`folder_id = $${params.length}`);
  }
  if (f.q) {
    params.push(f.q);
    where.push(`(title ILIKE '%' || $${params.length} || '%' OR content_text ILIKE '%' || $${params.length} || '%')`);
  }
  const { rows } = await db.query<NoteListRow>(
    `SELECT id, folder_id, title, left(content_text, 140) AS excerpt, origin, pinned, missing_upstream_at, updated_at
       FROM notes ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY pinned DESC, updated_at DESC LIMIT 300`,
    params,
  );
  return rows;
}

export async function getNote(db: Db, id: string) {
  const { rows } = await db.query('SELECT * FROM notes WHERE id = $1', [id]);
  if (!rows[0]) throw new HttpError(404, 'Note not found');
  return rows[0];
}

export async function createNote(db: Db, input: { folderId?: string | null; title?: string }) {
  const { rows } = await db.query<{ id: string }>('INSERT INTO notes (folder_id, title) VALUES ($1, $2) RETURNING id', [
    input.folderId ?? null,
    input.title ?? '',
  ]);
  return rows[0]!.id;
}

export async function updateNote(
  db: Db,
  id: string,
  patch: { title?: string; content?: unknown; contentText?: string; folderId?: string | null; pinned?: boolean },
) {
  const sets: string[] = [];
  const params: unknown[] = [id];
  const set = (col: string, v: unknown) => {
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.title !== undefined) set('title', patch.title);
  if (patch.content !== undefined) set('content', JSON.stringify(patch.content));
  if (patch.contentText !== undefined) set('content_text', patch.contentText);
  if (patch.folderId !== undefined) set('folder_id', patch.folderId);
  if (patch.pinned !== undefined) set('pinned', patch.pinned);
  if (!sets.length) return;
  const { rowCount } = await db.query(`UPDATE notes SET ${sets.join(', ')} WHERE id = $1`, params);
  if (!rowCount) throw new HttpError(404, 'Note not found');
}

export async function deleteNote(db: Db, id: string) {
  await db.query('DELETE FROM notes WHERE id = $1', [id]);
}

export async function createFolder(db: Db, name: string, parentId: string | null) {
  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO note_folders (name, parent_id, position) VALUES ($1, $2, extract(epoch FROM now())) RETURNING id',
    [name, parentId],
  );
  return rows[0]!.id;
}

/** True when `candidate` is `folderId` itself or one of its descendants. */
export async function isDescendant(db: Db, folderId: string, candidate: string): Promise<boolean> {
  const { rows } = await db.query<{ hit: boolean }>(
    `WITH RECURSIVE sub AS (
       SELECT id FROM note_folders WHERE id = $1
       UNION ALL SELECT f.id FROM note_folders f JOIN sub ON f.parent_id = sub.id)
     SELECT EXISTS (SELECT 1 FROM sub WHERE id = $2) AS hit`,
    [folderId, candidate],
  );
  return !!rows[0]?.hit;
}

/** Rename or move a folder. Moving a folder into its own subtree is refused. */
export async function updateFolder(db: Db, id: string, patch: { name?: string; parentId?: string | null; position?: number }) {
  if (patch.parentId && (await isDescendant(db, id, patch.parentId))) {
    throw new HttpError(400, 'A folder cannot be moved inside itself');
  }
  const sets: string[] = [];
  const params: unknown[] = [id];
  if (patch.name !== undefined) {
    params.push(patch.name);
    sets.push(`name = $${params.length}`);
  }
  if (patch.parentId !== undefined) {
    params.push(patch.parentId);
    sets.push(`parent_id = $${params.length}`);
  }
  if (patch.position !== undefined) {
    params.push(patch.position);
    sets.push(`position = $${params.length}`);
  }
  if (!sets.length) return;
  await db.query(`UPDATE note_folders SET ${sets.join(', ')} WHERE id = $1`, params);
}

/** Deleting a folder keeps its notes: they move to the parent (or to no folder). */
export async function deleteFolder(db: PoolClient, id: string) {
  const { rows } = await db.query<{ parent_id: string | null }>('SELECT parent_id FROM note_folders WHERE id = $1', [id]);
  if (!rows[0]) return;
  const parent = rows[0].parent_id;
  await db.query(
    `WITH RECURSIVE sub AS (SELECT id FROM note_folders WHERE id = $1 UNION ALL SELECT f.id FROM note_folders f JOIN sub ON f.parent_id = sub.id)
     UPDATE notes SET folder_id = $2 WHERE folder_id IN (SELECT id FROM sub)`,
    [id, parent],
  );
  await db.query('DELETE FROM note_folders WHERE id = $1', [id]);
}

/** Plain text (and a little HTML) into a Tiptap document. */
export function textToDoc(text: string, html?: string | null) {
  const source = html ? html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '') : text;
  const decoded = source.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const paragraphs = decoded.split(/\n{1,}/).map((p) => p.trim()).filter(Boolean);
  return {
    doc: {
      type: 'doc',
      content: paragraphs.map((p) =>
        /^[-*]\s+/.test(p)
          ? { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: p.replace(/^[-*]\s+/, '') }] }] }] }
          : { type: 'paragraph', content: [{ type: 'text', text: p }] },
      ),
    },
    text: paragraphs.join('\n'),
  };
}

async function folderForPath(db: Db, path: string, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(path);
  if (hit) return hit;
  const parts = path.split('/');
  const parentPath = parts.slice(0, -1).join('/');
  const parentId = parentPath ? await folderForPath(db, parentPath, cache) : null;
  const existing = await db.query<{ id: string }>('SELECT id FROM note_folders WHERE mail_path = $1', [path]);
  let id = existing.rows[0]?.id;
  if (!id) {
    const res = await db.query<{ id: string }>(
      'INSERT INTO note_folders (name, parent_id, mail_path, position) VALUES ($1, $2, $3, extract(epoch FROM now())) RETURNING id',
      [parts[parts.length - 1], parentId, path],
    );
    id = res.rows[0]!.id;
  }
  cache.set(path, id);
  return id;
}

export async function syncNotesFromMail(db: Db, root = 'Notes') {
  const run = await db.query<{ id: string }>("INSERT INTO intake_runs (channel) VALUES ('notes') RETURNING id");
  try {
    const messages = await mailProvider(db).fetchTree(root);
    const cache = new Map<string, string>();
    let created = 0;
    let updated = 0;
    const seen: string[] = [];
    for (const m of messages) {
      const path = normalizeFolderPath(m.folder);
      const folderId = await folderForPath(db, path, cache);
      const { doc, text } = textToDoc(m.text, m.html);
      seen.push(m.messageId);
      const res = await db.query<{ inserted: boolean }>(
        `INSERT INTO notes (folder_id, title, content, content_text, origin, external_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'mail', $5, $6, $6)
         ON CONFLICT (external_id) DO UPDATE SET missing_upstream_at = NULL
         RETURNING (xmax = 0) AS inserted`,
        [folderId, m.subject, JSON.stringify(doc), text, m.messageId, m.receivedAt],
      );
      if (res.rows[0]?.inserted) created += 1;
      else updated += 1;
    }
    const missing = await db.query(
      "UPDATE notes SET missing_upstream_at = coalesce(missing_upstream_at, now()) WHERE origin = 'mail' AND NOT (external_id = ANY($1::text[]))",
      [seen],
    );
    await db.query('UPDATE intake_runs SET finished_at = now(), fetched = $2, created = $3, skipped = $4 WHERE id = $1', [
      run.rows[0]!.id,
      messages.length,
      created,
      updated,
    ]);
    return { fetched: messages.length, created, unchanged: updated, missingUpstream: missing.rowCount ?? 0 };
  } catch (err) {
    await db.query('UPDATE intake_runs SET finished_at = now(), error = $2 WHERE id = $1', [run.rows[0]!.id, (err as Error).message]);
    throw err;
  }
}
