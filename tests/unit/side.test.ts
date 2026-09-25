import { describe, expect, it } from 'vitest';
import { clientByContent, domainMatches, inferSide, mentions, type InferContext } from '@/lib/domain/side';

const ctx: InferContext = {
  clients: [
    { id: 'bw', name: 'Brightwater Logistics', aliases: ['Brightwater', 'BWL'], domains: ['brightwater.example.com'], side: 'partner' },
    { id: 'kh', name: 'Kestrel Health', aliases: ['Kestrel'], domains: ['kestrelhealth.example.com'], side: 'partner' },
    { id: 'op', name: 'Orchard & Pine Foods', aliases: ['Orchard & Pine'], domains: ['orchardpine.example.com'], side: 'direct' },
    { id: 'nl', name: 'Northlight Studio', aliases: ['Northlight'], domains: ['northlight.example.com'], side: 'direct' },
  ],
  overrides: [
    { kind: 'sender', pattern: 'sam.rivera@mailbox.example.com', side: 'direct', clientId: 'nl' },
    { kind: 'keyword', pattern: 'Dayton warehouse', side: 'partner', clientId: 'bw' },
  ],
  partnerDomains: ['harborvale.example.com'],
  ownDomains: ['lumen.example.com'],
};

describe('side inference', () => {
  it('uses the client domain of the sender', () => {
    const r = inferSide({ fromEmail: 'grace@orchardpine.example.com', title: 'Checklist', body: 'Hi' }, ctx);
    expect(r).toMatchObject({ side: 'direct', clientId: 'op', confidence: 'high' });
  });

  it('treats partner firm mail as partner work even when it mentions nothing', () => {
    const r = inferSide({ fromEmail: 'priya@harborvale.example.com', title: 'Timesheet template', body: 'See attached.' }, ctx);
    expect(r).toMatchObject({ side: 'partner', clientId: null });
  });

  it('picks the partner client a partner colleague writes about', () => {
    const r = inferSide({ fromEmail: 'priya@harborvale.example.com', title: 'Kestrel schedule', body: 'Kestrel wants Tuesday.' }, ctx);
    expect(r).toMatchObject({ side: 'partner', clientId: 'kh' });
  });

  it('does not let a partner email be tagged with an own client it mentions in passing', () => {
    const r = inferSide({ fromEmail: 'daniel@harborvale.example.com', title: 'Retail deck', body: 'Like we did for Northlight.' }, ctx);
    expect(r.side).toBe('partner');
    expect(r.clientId).toBeNull();
  });

  it('lets a sender override beat the content', () => {
    const r = inferSide({ fromEmail: 'Sam.Rivera@mailbox.example.com', title: 'Roles', body: 'Brightwater Brightwater Brightwater' }, ctx);
    expect(r).toMatchObject({ side: 'direct', clientId: 'nl', confidence: 'override' });
  });

  it('lets a keyword override decide over an unknown sender', () => {
    const r = inferSide({ fromEmail: 'someone@unknown.example.com', title: 'Notes', body: 'Visit to the Dayton warehouse' }, ctx);
    expect(r).toMatchObject({ side: 'partner', clientId: 'bw', confidence: 'override' });
  });

  it('uses participants when the sender is a note-taker', () => {
    const r = inferSide({ fromEmail: 'notes@notetaker.example.com', participants: ['maya@lumen.example.com', 'lena@brightwater.example.com'], title: 'Pilot', body: '' }, ctx);
    expect(r).toMatchObject({ side: 'partner', clientId: 'bw' });
  });

  it('falls back to content, then to own practice with low confidence', () => {
    expect(inferSide({ title: 'Orchard & Pine site visit', body: '' }, ctx)).toMatchObject({ clientId: 'op', confidence: 'medium' });
    expect(inferSide({ title: 'Pricing thoughts', body: 'nothing here' }, ctx)).toMatchObject({ side: 'direct', clientId: null, confidence: 'low' });
  });

  it('ignores the consultant own domain as evidence', () => {
    const r = inferSide({ fromEmail: 'maya@lumen.example.com', title: 'Re: Kestrel', body: '' }, ctx);
    expect(r.clientId).toBe('kh');
  });
});

describe('matching helpers', () => {
  it('matches subdomains but not look-alikes', () => {
    expect(domainMatches('mail.brightwater.example.com', 'brightwater.example.com')).toBe(true);
    expect(domainMatches('notbrightwater.example.com', 'brightwater.example.com')).toBe(false);
  });
  it('matches whole words only', () => {
    expect(mentions('the Kestrel team', 'Kestrel')).toBe(true);
    expect(mentions('kestrels are birds', 'Kestrel')).toBe(false);
  });
  it('prefers the client mentioned most', () => {
    expect(clientByContent('Kestrel once, Brightwater twice, Brightwater', ctx.clients)?.id).toBe('bw');
  });
});
