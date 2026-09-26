/**
 * Which side of the consultant's work a meeting or email belongs to, and for
 * which client.
 *
 * Partner work is billed through the partner firm's timesheet and own-client
 * work is invoiced directly, so a wrong side lands a task in the wrong report.
 *
 * Order of evidence, strongest first:
 *   1. A deterministic override (sender, domain or keyword) set by a person.
 *      Nothing read from content may contradict it.
 *   2. The sender's email domain: a client's domain, or the partner firm's.
 *   3. Participants' domains.
 *   4. A client's name or alias mentioned in the title or body.
 *   5. Nothing matched: own practice, flagged as a guess.
 *
 * The partner firm's domain decides the SIDE but not the client: an email from
 * a partner colleague is partner work, and the client is whichever partner
 * client the content mentions, if any.
 */

export type Side = 'partner' | 'direct';

export interface ClientRef {
  id: string;
  name: string;
  aliases: string[];
  domains: string[];
  side: Side;
  active?: boolean;
}

export interface SideOverride {
  kind: 'sender' | 'domain' | 'keyword';
  pattern: string;
  side: Side;
  clientId: string | null;
}

export interface InferInput {
  fromEmail?: string | null;
  participants?: string[];
  title: string;
  body: string;
}

export interface InferContext {
  clients: ClientRef[];
  overrides: SideOverride[];
  /** Domains of the partner firm, e.g. ["harborvale.example.com"]. */
  partnerDomains: string[];
  /** The consultant's own domains; never evidence of anything. */
  ownDomains?: string[];
}

export interface Inference {
  side: Side;
  clientId: string | null;
  /** Short machine-readable reason, shown in the UI as provenance. */
  reason: string;
  confidence: 'override' | 'high' | 'medium' | 'low';
}

export function domainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  return email.slice(at + 1).trim().toLowerCase().replace(/>$/, '') || null;
}

/** True when `domain` is `base` or one of its subdomains. */
export function domainMatches(domain: string, base: string): boolean {
  const d = domain.toLowerCase();
  const b = base.toLowerCase();
  return d === b || d.endsWith('.' + b);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word, case-insensitive mention. "Orchard" must not match "orchardist". */
export function mentions(text: string, term: string): boolean {
  const t = term.trim();
  if (t.length < 2) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(t)}($|[^\\p{L}\\p{N}])`, 'iu').test(text);
}

function clientByDomain(domain: string, clients: ClientRef[]): ClientRef | undefined {
  return clients.find((c) => c.domains.some((d) => domainMatches(domain, d)));
}

/** The client mentioned most often; ties go to the earliest mention. */
export function clientByContent(text: string, clients: ClientRef[], side?: Side): ClientRef | undefined {
  let best: { c: ClientRef; score: number; first: number } | undefined;
  for (const c of clients) {
    if (side && c.side !== side) continue;
    let score = 0;
    let first = Number.POSITIVE_INFINITY;
    for (const term of [c.name, ...c.aliases]) {
      if (!mentions(text, term)) continue;
      const re = new RegExp(escapeRe(term), 'gi');
      const hits = text.match(re)?.length ?? 0;
      score += hits;
      first = Math.min(first, text.toLowerCase().indexOf(term.toLowerCase()));
    }
    if (score === 0) continue;
    if (!best || score > best.score || (score === best.score && first < best.first)) best = { c, score, first };
  }
  return best?.c;
}

export function inferSide(input: InferInput, ctx: InferContext): Inference {
  const from = (input.fromEmail ?? '').toLowerCase();
  const fromDomain = domainOf(from);
  const text = `${input.title}\n${input.body}`;
  const own = ctx.ownDomains ?? [];

  // 1. Overrides: sender beats domain beats keyword.
  const sender = ctx.overrides.find((o) => o.kind === 'sender' && o.pattern.toLowerCase() === from);
  if (sender) return { side: sender.side, clientId: sender.clientId, reason: `override:sender:${sender.pattern}`, confidence: 'override' };
  if (fromDomain) {
    const dom = ctx.overrides.find((o) => o.kind === 'domain' && domainMatches(fromDomain, o.pattern));
    if (dom) return { side: dom.side, clientId: dom.clientId, reason: `override:domain:${dom.pattern}`, confidence: 'override' };
  }
  const kw = ctx.overrides.find((o) => o.kind === 'keyword' && mentions(text, o.pattern));
  if (kw) return { side: kw.side, clientId: kw.clientId, reason: `override:keyword:${kw.pattern}`, confidence: 'override' };

  // 2. Sender domain.
  if (fromDomain && !own.some((d) => domainMatches(fromDomain, d))) {
    const c = clientByDomain(fromDomain, ctx.clients);
    if (c) return { side: c.side, clientId: c.id, reason: `domain:${fromDomain}`, confidence: 'high' };
    if (ctx.partnerDomains.some((d) => domainMatches(fromDomain, d))) {
      const mentioned = clientByContent(text, ctx.clients, 'partner');
      return {
        side: 'partner',
        clientId: mentioned?.id ?? null,
        reason: mentioned ? `partner-domain:${fromDomain}+content:${mentioned.name}` : `partner-domain:${fromDomain}`,
        confidence: 'high',
      };
    }
  }

  // 3. Participants.
  const partDomains = (input.participants ?? [])
    .map(domainOf)
    .filter((d): d is string => !!d && !own.some((o) => domainMatches(d, o)));
  for (const d of partDomains) {
    const c = clientByDomain(d, ctx.clients);
    if (c) return { side: c.side, clientId: c.id, reason: `participant:${d}`, confidence: 'high' };
  }
  const partnerParticipant = partDomains.find((d) => ctx.partnerDomains.some((p) => domainMatches(d, p)));

  // 4. Content.
  const mentioned = clientByContent(text, ctx.clients, partnerParticipant ? 'partner' : undefined);
  if (mentioned) {
    return { side: mentioned.side, clientId: mentioned.id, reason: `content:${mentioned.name}`, confidence: 'medium' };
  }
  if (partnerParticipant) {
    return { side: 'partner', clientId: null, reason: `participant:${partnerParticipant}`, confidence: 'medium' };
  }

  // 5. Nothing to go on.
  return { side: 'direct', clientId: null, reason: 'default', confidence: 'low' };
}
