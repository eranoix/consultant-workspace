/**
 * The summarizer behind the approval hub, behind a provider adapter.
 *
 * `mock` (the default) is deterministic: the same meeting notes always give
 * the same topics, decisions and candidate tasks, so the demo, the seed and
 * the tests agree with each other and nothing depends on a network or a key.
 * `openai-compatible` posts to any chat-completions endpoint and expects the
 * same JSON shape back; whatever it returns is validated before it is used.
 */
import { z } from 'zod';

export interface SummaryInput {
  kind: 'meeting' | 'email';
  title: string;
  body: string;
  occurredAt: Date;
}

export interface CandidateDraft {
  title: string;
  details: string;
  dueDate: string | null;
}

export interface Summary {
  summary: string;
  topics: string[];
  keyDecisions: string[];
  participants: string[];
  tasks: CandidateDraft[];
  provider: string;
}

export interface Summarizer {
  name: string;
  summarize(input: SummaryInput): Promise<Summary>;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "by Friday", "by 2026-10-02", "tomorrow", "next week", "end of month". */
export function extractDue(text: string, from: Date): string | null {
  const t = text.toLowerCase();
  const explicit = /\b(\d{4}-\d{2}-\d{2})\b/.exec(t);
  if (explicit) return explicit[1]!;
  const base = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  if (/\btoday\b|\beod\b/.test(t)) return iso(base);
  if (/\btomorrow\b/.test(t)) return iso(new Date(base.getTime() + 86_400_000));
  const wd = /\b(?:by|on|before|until)\s+(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.exec(t);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[1]!);
    let delta = (target - base.getUTCDay() + 7) % 7;
    if (delta === 0) delta = 7;
    return iso(new Date(base.getTime() + delta * 86_400_000));
  }
  if (/\bnext week\b/.test(t)) return iso(new Date(base.getTime() + 7 * 86_400_000));
  if (/\bend of (the )?month\b/.test(t)) {
    return iso(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)));
  }
  return null;
}

const TASK_LINE = /^\s*(?:[-*]\s*)?(?:\[ \]\s*|action(?: item)?s?\s*[:-]\s*|todo\s*[:-]\s*|next step\s*[:-]\s*|follow[- ]up\s*[:-]\s*)(.+)$/i;
const DECISION_LINE = /^\s*(?:[-*]\s*)?(?:decision|decided|agreed)\s*[:-]\s*(.+)$/i;
const REQUEST = /\b(?:could you|can you|please|would you mind|we need you to|i need you to)\b\s*(.+?)[.?!]?$/i;
const ATTENDEES = /^\s*(?:attendees|participants|present)\s*:\s*(.+)$/i;

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/^[\s\-*:]+/, '').trim();
}

function sentenceCase(s: string): string {
  const c = clean(s).replace(/[.;]+$/, '');
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 10)).trimEnd() + '...';
}

/** Task title: drop owner prefixes ("Maya to ...") and trailing due phrases. */
function taskTitle(line: string): string {
  let t = clean(line)
    .replace(/^(?:[A-Z][a-z]+(?: and [A-Z][a-z]+)?)\s+(?:to|will)\s+/, '')
    .replace(/^(?:also|then|just)\s+/i, '')
    .replace(/\s+(?:by|before|until|on)\s+(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|end of (?:the )?month|\d{4}-\d{2}-\d{2})\b.*$/i, '')
    .replace(/\s+(?:by|before)\s+next week\b.*$/i, '')
    .replace(/[.;]+$/, '');
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return shorten(t, 120);
}

export function mockSummarize(input: SummaryInput): Summary {
  const lines = input.body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const topics: string[] = [];
  const keyDecisions: string[] = [];
  const participants: string[] = [];
  const tasks: CandidateDraft[] = [];
  const seenTasks = new Set<string>();

  const addTask = (raw: string) => {
    const title = taskTitle(raw);
    const key = title.toLowerCase();
    if (!title || seenTasks.has(key)) return;
    seenTasks.add(key);
    tasks.push({ title, details: sentenceCase(raw), dueDate: extractDue(raw, input.occurredAt) });
  };

  for (const line of lines) {
    const att = ATTENDEES.exec(line);
    if (att) {
      participants.push(...att[1]!.split(/[,;]/).map((s) => s.trim()).filter(Boolean));
      continue;
    }
    const dec = DECISION_LINE.exec(line);
    if (dec) {
      keyDecisions.push(sentenceCase(dec[1]!));
      continue;
    }
    const task = TASK_LINE.exec(line);
    if (task) {
      addTask(task[1]!);
      continue;
    }
    if (input.kind === 'email') {
      const req = REQUEST.exec(line);
      if (req && req[1]!.length > 8) {
        addTask(req[1]!);
        continue;
      }
    }
    if (/^(hi|hello|dear|thanks|thank you|best|regards|cheers)\b/i.test(line)) continue;
    if (/^[-*]/.test(line) || /^(topic|agenda|discussed)\s*:/i.test(line) || input.kind === 'meeting') {
      const topic = sentenceCase(line.replace(/^(topic|agenda|discussed)\s*:/i, ''));
      if (topic.length > 3 && topics.length < 6) topics.push(shorten(topic, 110));
    }
  }

  let summary: string;
  if (input.kind === 'meeting') {
    // Meeting notes are already structured: say what was covered and decided.
    const parts: string[] = [];
    if (topics.length) parts.push(`Covered: ${topics.slice(0, 3).join('; ')}.`);
    if (keyDecisions.length) parts.push(`Decided: ${keyDecisions[0]}.`);
    if (tasks.length) parts.push(`${tasks.length} follow-up${tasks.length === 1 ? '' : 's'} proposed.`);
    summary = parts.join(' ');
  } else {
    // Email prose, minus greetings, sign-offs and one-word lines (a name).
    const prose = lines
      .filter((l) => !/^(hi|hello|dear|thanks|thank you|best|regards|cheers)\b[,!.]?$/i.test(l) && !/^(hi|hello|dear)\b/i.test(l) && l.split(/\s+/).length > 2)
      .join(' ');
    const sentences = prose.split(/(?<=[.!?])\s+/).filter((x) => x.length > 12);
    summary = sentences.slice(0, 2).join(' ');
    if (topics.length === 0) topics.push(...sentences.slice(0, 3).map((x) => shorten(sentenceCase(x), 110)));
  }

  return {
    summary: shorten(summary, 400),
    topics,
    keyDecisions,
    participants,
    tasks,
    provider: 'mock',
  };
}

const SummarySchema = z.object({
  summary: z.string().default(''),
  topics: z.array(z.string()).default([]),
  keyDecisions: z.array(z.string()).default([]),
  participants: z.array(z.string()).default([]),
  tasks: z
    .array(z.object({ title: z.string().min(1), details: z.string().default(''), dueDate: z.string().nullable().default(null) }))
    .default([]),
});

class MockSummarizer implements Summarizer {
  name = 'mock';
  async summarize(input: SummaryInput): Promise<Summary> {
    return mockSummarize(input);
  }
}

class OpenAiCompatibleSummarizer implements Summarizer {
  name = 'openai-compatible';
  constructor(
    private url: string,
    private key: string,
    private model: string,
  ) {}

  async summarize(input: SummaryInput): Promise<Summary> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.key}` },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Summarize the text for a consultant. Reply with JSON: {summary, topics[], keyDecisions[], participants[], tasks[{title, details, dueDate (YYYY-MM-DD or null)}]}. Only include tasks someone explicitly committed to or was asked to do.',
          },
          { role: 'user', content: `${input.kind.toUpperCase()} on ${iso(input.occurredAt)}: ${input.title}\n\n${input.body}` },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`summarizer HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = SummarySchema.parse(JSON.parse(data.choices?.[0]?.message?.content ?? '{}'));
    return { ...parsed, provider: this.name };
  }
}

export function summarizer(env: NodeJS.ProcessEnv = process.env): Summarizer {
  if (env.LLM_PROVIDER === 'openai-compatible' && env.LLM_API_URL && env.LLM_API_KEY) {
    return new OpenAiCompatibleSummarizer(env.LLM_API_URL, env.LLM_API_KEY, env.LLM_MODEL || 'default');
  }
  return new MockSummarizer();
}
