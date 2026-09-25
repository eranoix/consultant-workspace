import { describe, expect, it } from 'vitest';
import { conflicts, DEFAULT_SHORTCUTS, matchSequence, mergeShortcuts, normalizeCombo } from '@/lib/domain/shortcuts';

describe('keyboard shortcuts', () => {
  it('matches two-key sequences and waits on a prefix', () => {
    expect(matchSequence(['g'], DEFAULT_SHORTCUTS)).toBe('pending');
    expect(matchSequence(['g', 'b'], DEFAULT_SHORTCUTS)).toBe('go.board');
    expect(matchSequence(['?'], DEFAULT_SHORTCUTS)).toBe('help');
    expect(matchSequence(['x'], DEFAULT_SHORTCUTS)).toBeNull();
  });

  it('merges saved shortcuts over the defaults and drops junk', () => {
    const m = mergeShortcuts({ 'go.board': 'B', 'go.nowhere': 'z', 'go.goals': 'ctrl+g' });
    expect(m['go.board']).toBe('b');
    expect(m['go.goals']).toBe(DEFAULT_SHORTCUTS['go.goals']);
    expect('go.nowhere' in m).toBe(false);
  });

  it('finds duplicates and shadowed sequences', () => {
    expect(conflicts(DEFAULT_SHORTCUTS)).toEqual([]);
    expect(conflicts({ ...DEFAULT_SHORTCUTS, 'go.board': 'g d' }).sort()).toEqual(['go.board', 'go.dashboard']);
    expect(conflicts({ ...DEFAULT_SHORTCUTS, help: 'g' }).length).toBeGreaterThan(1);
  });

  it('normalizes combos', () => {
    expect(normalizeCombo('  G   B ')).toBe('g b');
    expect(normalizeCombo('g b c')).toBeNull();
    expect(normalizeCombo('')).toBeNull();
  });
});
