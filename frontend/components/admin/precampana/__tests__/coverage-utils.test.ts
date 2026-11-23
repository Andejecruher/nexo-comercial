import { describe, expect, it } from 'vitest';
import { coverageTier, coverageTierStyle, formatCoveragePct, topN } from '../coverage-utils';

describe('coverage-utils', () => {
  it('classifies null coverage as none and formats it as Sin meta', () => {
    expect(coverageTier(null)).toBe('none');
    expect(coverageTier(undefined)).toBe('none');
    expect(formatCoveragePct(null)).toBe('Sin meta');
    expect(coverageTierStyle('none').label).toBe('Sin meta');
  });

  it('uses absolute bands against the effective target, not a relative maximum', () => {
    expect(coverageTier(10)).toBe('low');
    expect(coverageTier(33)).toBe('medium');
    expect(coverageTier(65.9)).toBe('medium');
    expect(coverageTier(66)).toBe('high');
    expect(formatCoveragePct(40.4)).toBe('40%');
  });

  it('derives Top N by total descending without mutating the source', () => {
    const items = [
      { label: 'A', total: 1 },
      { label: 'B', total: 9 },
      { label: 'C', total: 4 },
    ];
    expect(topN(items, 2).map((item) => item.label)).toEqual(['B', 'C']);
    expect(items[0]?.label).toBe('A');
  });
});
