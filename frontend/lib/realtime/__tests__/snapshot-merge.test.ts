import { describe, expect, it } from 'vitest';
import { mergeMessageSnapshot } from '../snapshot-merge';

describe('REST and live message reconciliation', () => {
  it('retains a live message received while a stale snapshot was loading', () => {
    const a = { id: 'a', createdAt: '2026-10-13T10:00:00Z', body: 'older' };
    const b = { id: 'b', createdAt: '2026-10-13T10:00:01Z', body: 'live' };
    expect(mergeMessageSnapshot([a], [a, b])).toEqual([a, b]);
    expect(mergeMessageSnapshot([a, b], [a, b])).toEqual([a, b]);
  });
  it('preserves a newer live delivery state over a snapshot started before that event', () => {
    const stale = { id: 'a', createdAt: '2026-10-13T10:00:00Z', status: 'sent' };
    const live = { ...stale, status: 'delivered' };
    expect(mergeMessageSnapshot([stale], [live], true)).toEqual([live]);
    expect(mergeMessageSnapshot([live], [stale])).toEqual([live]);
  });
});
