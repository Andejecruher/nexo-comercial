import { describe, expect, it } from '@jest/globals';

import { AppError } from '../../utils/app-error';
import { getMondaySundayWeekBounds, parseWeekReferenceDate } from '../../utils/week-range';

const TZ = 'America/Mexico_City';

describe('week-range', () => {
  it('parseWeekReferenceDate rechaza formato inválido', () => {
    expect(() => parseWeekReferenceDate('05-05-2026', TZ)).toThrow(AppError);
  });

  it('getMondaySundayWeekBounds: martes 2026-05-05 → lun 4 – dom 10 mayo', () => {
    const ref = parseWeekReferenceDate('2026-05-05', TZ);
    const bounds = getMondaySundayWeekBounds(TZ, ref);
    expect(bounds.weekStartsOn).toBe('2026-05-04');
    expect(bounds.weekEndsOn).toBe('2026-05-10');
    expect(bounds.timeZone).toBe(TZ);
    expect(bounds.rangeStartUtc.getTime()).toBeLessThan(bounds.rangeEndUtc.getTime());
  });
});
