'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ChevronDown, ChevronRight, Folder, FolderInput, FolderPlus, MailOpen, NotebookPen, Pin, Plus, Search, Trash2 } from 'lucide-react';
import { api, fetcher } from '@/lib/client/api';
import { useLocale, useT } from '@/i18n/client';
import { Button, cx, Empty, PageHeader, Spinner, useToast } from '../ui';
import { useDrawerParam } from '../board/TaskDrawer';
import { NoteEditor, type NoteDoc } from './NoteEditor';

interface FolderRow {
  id: string;
  parent_id: string | null;
  name: string;
  mail_path: string | null;
  note_count: number;
}
interface NoteRow {
  id: string;
  folder_id: string | null;
  title: string;
  excerpt: string;
  origin: 'manual' | 'mail';
  pinned: boolean;
  missing_upstream_at: string | null;
  updated_at: string;
}

type Drag = { kind: 'folder' | 'note'; id: string } | null;

export function NotesView() {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [folder, setFolder] = useDrawerParam('folder');
  const [noteId, setNoteId] = useDrawerParam('note');
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  const { data: folders, mutate: mutateFolders } = useSWR<{ folders: FolderRow[] }>('/api/notes/folders', fetcher);
  const listKey = `/api/notes?${new URLSearchParams({ ...(folder ? { folder } : {}), ...(q ? { q } : {}) })}`;
  const { data: notes, mutate: mutateNotes } = useSWR<{ notes: NoteRow[] }>(listKey, fetcher);
  const { data: note } = useSWR<NoteDoc>(noteId ? `/api/notes/${noteId}` : null, fetcher, { revalidateOnFocus: false });

  const children = useMemo(() => {
    const map = new Map<string | null, FolderRow[]>();
    for (const f of folders?.folders ?? []) map.set(f.parent_id, [...(map.get(f.parent_id) ?? []), f]);
    return map;
  }, [folders]);

  const refresh = () => {
    void mutateFolders();
    void mutateNotes();
  };

  const dropOn = async (target: string | null) => {
    const d = drag;
    setDrag(null);
    setOver(null);
    if (!d) return;
    try {
      if (d.kind === 'folder') {
        if (d.id === target) return;
        await api(`/api/notes/folders/${d.id}`, { method: 'PATCH', body: { parentId: target } });
        toast(t('notes.toast.folderMoved'));
      } else {
        await api(`/api/notes/${d.id}`, { method: 'PATCH', body: { folderId: target } });
        toast(t('notes.toast.noteMoved'));
      }
      refresh();
    } catch (e) {
      toast((e as Error).message, { tone: 'error' });
    }
  };

  const dropProps = (target: string | null, key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOver(key);
    },
    onDragLeave: () => setOver((o) => (o === key ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void dropOn(target);
    },
  });

  const renderTree = (parent: string | null, depth: number): React.ReactNode =>
    (children.get(parent) ?? []).map((f) => {
      const kids = children.get(f.id) ?? [];
      const isCollapsed = collapsed.has(f.id);
      return (
        <li key={f.id}>
          <div
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              setDrag({ kind: 'folder', id: f.id });
            }}
            {...dropProps(f.id, f.id)}
            className={cx(
              'group flex items-center gap-1 rounded-md py-1 pr-1 text-sm',
              folder === f.id ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-100',
              over === f.id && 'ring-2 ring-brand-400',
            )}
            style={{ paddingLeft: 4 + depth * 14 }}
            data-testid="folder"
          >
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center text-ink-400"
              aria-label={isCollapsed ? t('notes.expand') : t('notes.collapse')}
              onClick={() => {
                const next = new Set(collapsed);
                if (isCollapsed) next.delete(f.id);
                else next.add(f.id);
                setCollapsed(next);
              }}
            >
              {kids.length > 0 ? isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" /> : null}
            </button>
            {renaming === f.id ? (
              <form
                className="flex-1"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const name = new FormData(e.currentTarget).get('name') as string;
                  if (name.trim()) await api(`/api/notes/folders/${f.id}`, { method: 'PATCH', body: { name } });
                  setRenaming(null);
                  refresh();
                }}
              >
                <input name="name" defaultValue={f.name} autoFocus onBlur={() => setRenaming(null)} className="input h-7 py-0.5 text-sm" />
              </form>
            ) : (
              <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => setFolder(f.id)} onDoubleClick={() => setRenaming(f.id)}>
                {f.mail_path ? <MailOpen className="h-3.5 w-3.5 shrink-0 text-sky-600" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-ink-400" />}
                <span className="truncate">{f.name}</span>
                <span className="ml-auto text-[10px] text-ink-400">{f.note_count || ''}</span>
              </button>
            )}
            <button
              type="button"
              className="hidden h-6 w-6 items-center justify-center rounded text-ink-400 hover:text-red-600 group-hover:flex"
              aria-label={t('notes.deleteFolder')}
              onClick={async () => {
                if (!window.confirm(t('notes.confirmDeleteFolder'))) return;
                await api(`/api/notes/folders/${f.id}`, { method: 'DELETE' });
                if (folder === f.id) setFolder(null);
                refresh();
              }}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
          {!isCollapsed && kids.length > 0 && <ul>{renderTree(f.id, depth + 1)}</ul>}
        </li>
      );
    });

  return (
    <div>
      <PageHeader
        title={t('notes.title')}
        subtitle={t('notes.subtitle')}
        actions={
          <>
            <Button
              icon={<FolderInput className="h-4 w-4" />}
              loading={syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  const r = await api<{ created: number; unchanged: number; missingUpstream: number }>('/api/notes/sync', { method: 'POST' });
                  toast(t('notes.toast.synced', { created: r.created, unchanged: r.unchanged }));
                  refresh();
                } catch (e) {
                  toast((e as Error).message, { tone: 'error' });
                } finally {
                  setSyncing(false);
                }
              }}
            >
              {t('notes.sync')}
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={async () => {
                const res = await api<{ id: string }>('/api/notes', { method: 'POST', body: { folderId: folder && folder !== 'none' ? folder : null } });
                void mutateNotes();
                setNoteId(res.id);
              }}
            >
              {t('notes.new')}
            </Button>
          </>
        }
      />
      <div className="card grid h-[calc(100vh-190px)] min-h-[520px] grid-cols-[220px_280px_1fr] overflow-hidden">
        <aside className="flex flex-col border-r border-ink-100 bg-ink-50/50">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t('notes.folders')}</span>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100"
              aria-label={t('notes.newFolder')}
              title={t('notes.newFolder')}
              onClick={async () => {
                const name = window.prompt(t('notes.folderName'));
                if (!name?.trim()) return;
                await api('/api/notes/folders', { method: 'POST', body: { name, parentId: folder && folder !== 'none' ? folder : null } });
                refresh();
              }}
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            <button
              type="button"
              {...dropProps(null, 'root')}
              onClick={() => setFolder(null)}
              className={cx('mb-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm', !folder ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-100', over === 'root' && 'ring-2 ring-brand-400')}
            >
              <NotebookPen className="h-3.5 w-3.5" />
              {t('notes.all')}
            </button>
            {!folders ? <Spinner className="m-3 h-4 w-4" /> : <ul>{renderTree(null, 0)}</ul>}
            <p className="mt-4 px-2 text-[11px] leading-snug text-ink-400">{t('notes.dragHint')}</p>
          </div>
        </aside>
        <div className="flex min-h-0 flex-col border-r border-ink-100">
          <div className="relative border-b border-ink-100 p-2">
            <Search className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-ink-400" />
            <input className="input h-8 py-1 pl-8" placeholder={t('notes.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <ul className="flex-1 divide-y divide-ink-100 overflow-y-auto">
            {notes?.notes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  draggable
                  onDragStart={() => setDrag({ kind: 'note', id: n.id })}
                  onClick={() => setNoteId(n.id)}
                  className={cx('block w-full px-3 py-2.5 text-left', noteId === n.id ? 'bg-brand-50' : 'hover:bg-ink-50')}
                  data-testid="note-item"
                >
                  <p className="flex items-center gap-1 truncate text-sm font-medium text-ink-900">
                    {n.pinned && <Pin className="h-3 w-3 shrink-0 text-brand-700" />}
                    {n.origin === 'mail' && <MailOpen className="h-3 w-3 shrink-0 text-sky-600" />}
                    <span className="truncate">{n.title || t('notes.untitled')}</span>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{n.excerpt || ' '}</p>
                  <p className="mt-1 text-[10px] text-ink-400">{new Date(n.updated_at).toLocaleDateString(locale === 'pt' ? 'pt-BR' : 'en-US', { month: 'short', day: 'numeric' })}</p>
                </button>
              </li>
            ))}
            {notes && notes.notes.length === 0 && <li className="p-6 text-center text-xs text-ink-400">{t('notes.emptyFolder')}</li>}
          </ul>
        </div>
        <div className="min-h-0">
          {noteId && note ? (
            <NoteEditor
              key={note.id}
              note={note}
              onSaved={() => void mutateNotes()}
              onDelete={async () => {
                if (!window.confirm(t('notes.confirmDelete'))) return;
                await api(`/api/notes/${note.id}`, { method: 'DELETE' });
                setNoteId(null);
                refresh();
              }}
            />
          ) : noteId ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : (
            <Empty icon={<NotebookPen className="h-10 w-10" />} title={t('notes.pick')} hint={t('notes.pickHint')} />
          )}
        </div>
      </div>
    </div>
  );
}
