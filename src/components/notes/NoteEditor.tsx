'use client';

import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { Bold, Code, Heading2, Italic, List, ListChecks, ListOrdered, Pin, Quote, Redo2, Strikethrough, Trash2, Undo2 } from 'lucide-react';
import { api } from '@/lib/client/api';
import { useT } from '@/i18n/client';
import { Badge, cx } from '../ui';

export interface NoteDoc {
  id: string;
  title: string;
  content: Record<string, unknown>;
  origin: 'manual' | 'mail';
  pinned: boolean;
  missing_upstream_at: string | null;
  updated_at: string;
}

function ToolbarButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cx('inline-flex h-8 w-8 items-center justify-center rounded-md', active ? 'bg-ink-200 text-ink-900' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900')}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const t = useT();
  const c = () => editor.chain().focus();
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-ink-100 px-3 py-1.5">
      <ToolbarButton label={t('notes.toolbar.heading')} active={editor.isActive('heading', { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label={t('notes.toolbar.bold')} active={editor.isActive('bold')} onClick={() => c().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label={t('notes.toolbar.italic')} active={editor.isActive('italic')} onClick={() => c().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label={t('notes.toolbar.strike')} active={editor.isActive('strike')} onClick={() => c().toggleStrike().run()}>
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-ink-200" />
      <ToolbarButton label={t('notes.toolbar.bullets')} active={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label={t('notes.toolbar.numbers')} active={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label={t('notes.toolbar.tasks')} active={editor.isActive('taskList')} onClick={() => c().toggleTaskList().run()}>
        <ListChecks className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label={t('notes.toolbar.quote')} active={editor.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()}>
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label={t('notes.toolbar.code')} active={editor.isActive('codeBlock')} onClick={() => c().toggleCodeBlock().run()}>
        <Code className="h-4 w-4" />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-ink-200" />
      <ToolbarButton label={t('notes.toolbar.undo')} onClick={() => c().undo().run()}>
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton label={t('notes.toolbar.redo')} onClick={() => c().redo().run()}>
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

/** Autosaves a second after the last keystroke; the status shows what is on the server. */
export function NoteEditor({ note, onSaved, onDelete }: { note: NoteDoc; onSaved: () => void; onDelete: () => void }) {
  const t = useT();
  const [title, setTitle] = useState(note.title);
  const [status, setStatus] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Record<string, unknown>>({});

  const flush = async () => {
    const body = pending.current;
    pending.current = {};
    if (!Object.keys(body).length) return;
    setStatus('saving');
    try {
      await api(`/api/notes/${note.id}`, { method: 'PATCH', body });
      setStatus('saved');
      onSaved();
    } catch {
      setStatus('error');
    }
  };
  const queue = (patch: Record<string, unknown>) => {
    pending.current = { ...pending.current, ...patch };
    setStatus('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 900);
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), TaskList, TaskItem.configure({ nested: true }), Placeholder.configure({ placeholder: t('notes.placeholder') })],
    content: note.content,
    editorProps: { attributes: { class: 'prose prose-sm max-w-none prose-headings:font-semibold prose-p:my-2 focus:outline-none' } },
    onUpdate: ({ editor: ed }) => queue({ content: ed.getJSON(), contentText: ed.getText({ blockSeparator: '\n' }) }),
  });

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void flush();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ink-100 px-5 py-3">
        <input
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-ink-900 outline-none placeholder:text-ink-300"
          value={title}
          placeholder={t('notes.untitled')}
          aria-label={t('board.fields.title')}
          onChange={(e) => {
            setTitle(e.target.value);
            queue({ title: e.target.value });
          }}
        />
        {note.origin === 'mail' && <Badge tone="blue">{t('notes.fromMail')}</Badge>}
        {note.missing_upstream_at && <Badge tone="amber">{t('notes.missingUpstream')}</Badge>}
        <span className="w-16 text-right text-[11px] text-ink-400" data-testid="save-status">
          {t(`notes.status.${status}`)}
        </span>
        <button
          type="button"
          className={cx('inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-ink-100', note.pinned ? 'text-brand-700' : 'text-ink-400')}
          aria-label={t('notes.pin')}
          title={t('notes.pin')}
          onClick={async () => {
            await api(`/api/notes/${note.id}`, { method: 'PATCH', body: { pinned: !note.pinned } });
            onSaved();
          }}
        >
          <Pin className="h-4 w-4" />
        </button>
        <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-red-600" aria-label={t('common.delete')} onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {editor && <Toolbar editor={editor} />}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
