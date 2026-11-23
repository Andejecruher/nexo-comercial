/**
 * Tests unitarios: department-hours
 *
 * Cubre:
 *  - parseServiceSchedule: JSON válido, inválido, alwaysOpen, null, HH:MM malformados
 *  - isOpenAt: dentro/fuera de rango, alwaysOpen, sin horario (fail-open), día sin rangos,
 *    múltiples rangos, cruce de medianoche, zona horaria, TZ fallback
 */
import { describe, expect, it } from '@jest/globals';
import {
  isOpenAt,
  parseServiceSchedule,
  WeeklyServiceSchedule,
} from '../../../utils/department-hours';

const TZ = 'America/Mexico_City';

// ─── Helpers ─────────────────────────────────────────────────────────────────
// America/Mexico_City = UTC-6 (horario estándar, sin DST en jun-29 2026).
// Para convertir hora local → UTC: utcHour = localHour + 6.
// Usamos fechas UTC calculadas directamente para evitar problemas de conversión.

/** Lunes 2026-06-29 a las HH:MM hora México (UTC-6). */
function mondayAt(h: number, m: number): Date {
  // UTC = local + 6h
  const utcH = h + 6;
  const dayOffset = Math.floor(utcH / 24);
  return new Date(
    `2026-06-${String(29 + dayOffset).padStart(2, '0')}T${String(utcH % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`,
  );
}

/** Sábado 2026-06-27 a las HH:MM hora México (UTC-6). */
function saturdayAt(h: number, m: number): Date {
  const utcH = h + 6;
  const dayOffset = Math.floor(utcH / 24);
  return new Date(
    `2026-06-${String(27 + dayOffset).padStart(2, '0')}T${String(utcH % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`,
  );
}

/** Domingo 2026-06-28 a las HH:MM hora México (UTC-6). */
function sundayAt(h: number, m: number): Date {
  const utcH = h + 6;
  const dayOffset = Math.floor(utcH / 24);
  return new Date(
    `2026-06-${String(28 + dayOffset).padStart(2, '0')}T${String(utcH % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`,
  );
}

// ─── Horarios de ejemplo ──────────────────────────────────────────────────────

const lunesAViernesDe9A16: WeeklyServiceSchedule = {
  timezone: TZ,
  days: {
    1: [{ open: '09:00', close: '16:00' }],
    2: [{ open: '09:00', close: '16:00' }],
    3: [{ open: '09:00', close: '16:00' }],
    4: [{ open: '09:00', close: '16:00' }],
    5: [{ open: '09:00', close: '16:00' }],
  },
};

const multipleRanges: WeeklyServiceSchedule = {
  timezone: TZ,
  days: {
    1: [
      { open: '08:00', close: '12:00' },
      { open: '14:00', close: '17:00' },
    ],
  },
};

const midnightCrossing: WeeklyServiceSchedule = {
  timezone: TZ,
  days: {
    5: [{ open: '22:00', close: '02:00' }],
  },
};

// ─── parseServiceSchedule ────────────────────────────────────────────────────

describe('parseServiceSchedule', () => {
  it('devuelve null para null/undefined/array/string', () => {
    expect(parseServiceSchedule(null)).toBeNull();
    expect(parseServiceSchedule(undefined)).toBeNull();
    expect(parseServiceSchedule([])).toBeNull();
    expect(parseServiceSchedule('lunes a viernes')).toBeNull();
  });

  it('devuelve null para objeto vacío (sin alwaysOpen ni days)', () => {
    expect(parseServiceSchedule({})).toBeNull();
  });

  it('interpreta alwaysOpen=true correctamente', () => {
    const s = parseServiceSchedule({ alwaysOpen: true });
    expect(s?.alwaysOpen).toBe(true);
  });

  it('ignora alwaysOpen=false (sin days → null)', () => {
    expect(parseServiceSchedule({ alwaysOpen: false })).toBeNull();
  });

  it('extrae timezone cuando es string no vacío', () => {
    const s = parseServiceSchedule({
      timezone: TZ,
      days: { 1: [{ open: '09:00', close: '16:00' }] },
    });
    expect(s?.timezone).toBe(TZ);
  });

  it('descarta rangos con HH:MM malformados', () => {
    const s = parseServiceSchedule({
      days: {
        1: [
          { open: 'bad', close: '16:00' },
          { open: '09:00', close: '25:99' },
          { open: '09:00', close: '16:00' },
        ],
      },
    });
    // Solo el rango válido pasa
    expect(s?.days?.[1]).toHaveLength(1);
    expect(s?.days?.[1]?.[0]).toEqual({ open: '09:00', close: '16:00' });
  });

  it('descarta días con índice fuera de 0-6', () => {
    const s = parseServiceSchedule({ days: { 7: [{ open: '09:00', close: '16:00' }] } });
    expect(s).toBeNull(); // sin días válidos → null
  });

  it('descarta días cuyo valor no es array', () => {
    const s = parseServiceSchedule({ days: { 1: 'mañana' } });
    expect(s).toBeNull();
  });
});

// ─── isOpenAt — sin horario (fail-open) ──────────────────────────────────────

describe('isOpenAt — sin horario', () => {
  it('devuelve true cuando schedule es null (fail-open)', () => {
    expect(isOpenAt(null, mondayAt(10, 0), TZ)).toBe(true);
  });

  it('devuelve true cuando alwaysOpen=true (independiente del día/hora)', () => {
    const s: WeeklyServiceSchedule = { alwaysOpen: true };
    expect(isOpenAt(s, sundayAt(3, 0), TZ)).toBe(true);
  });

  it('devuelve true cuando schedule no tiene days', () => {
    const s: WeeklyServiceSchedule = {};
    expect(isOpenAt(s, mondayAt(20, 0), TZ)).toBe(true);
  });
});

// ─── isOpenAt — dentro/fuera de rango ────────────────────────────────────────

describe('isOpenAt — rango simple lunes-viernes 09:00-16:00', () => {
  it('lunes 10:30 → abierto', () => {
    expect(isOpenAt(lunesAViernesDe9A16, mondayAt(10, 30), TZ)).toBe(true);
  });

  it('lunes 09:00 exacto → abierto (borde de apertura incluido)', () => {
    expect(isOpenAt(lunesAViernesDe9A16, mondayAt(9, 0), TZ)).toBe(true);
  });

  it('lunes 15:59 → abierto', () => {
    expect(isOpenAt(lunesAViernesDe9A16, mondayAt(15, 59), TZ)).toBe(true);
  });

  it('lunes 16:00 → cerrado (borde de cierre excluido)', () => {
    expect(isOpenAt(lunesAViernesDe9A16, mondayAt(16, 0), TZ)).toBe(false);
  });

  it('lunes 08:59 → cerrado (antes de apertura)', () => {
    expect(isOpenAt(lunesAViernesDe9A16, mondayAt(8, 59), TZ)).toBe(false);
  });

  it('sábado 10:00 → cerrado (día sin rangos)', () => {
    expect(isOpenAt(lunesAViernesDe9A16, saturdayAt(10, 0), TZ)).toBe(false);
  });

  it('domingo 10:00 → cerrado (día sin rangos)', () => {
    expect(isOpenAt(lunesAViernesDe9A16, sundayAt(10, 0), TZ)).toBe(false);
  });
});

// ─── isOpenAt — múltiples rangos ─────────────────────────────────────────────

describe('isOpenAt — múltiples rangos (lunes 08-12 y 14-17)', () => {
  it('lunes 09:00 → abierto (primer rango)', () => {
    expect(isOpenAt(multipleRanges, mondayAt(9, 0), TZ)).toBe(true);
  });

  it('lunes 12:00 → cerrado (entre rangos, cierre excluido)', () => {
    expect(isOpenAt(multipleRanges, mondayAt(12, 0), TZ)).toBe(false);
  });

  it('lunes 13:59 → cerrado (entre rangos)', () => {
    expect(isOpenAt(multipleRanges, mondayAt(13, 59), TZ)).toBe(false);
  });

  it('lunes 14:00 → abierto (segundo rango)', () => {
    expect(isOpenAt(multipleRanges, mondayAt(14, 0), TZ)).toBe(true);
  });

  it('lunes 16:59 → abierto (segundo rango)', () => {
    expect(isOpenAt(multipleRanges, mondayAt(16, 59), TZ)).toBe(true);
  });

  it('lunes 17:00 → cerrado (cierre de segundo rango)', () => {
    expect(isOpenAt(multipleRanges, mondayAt(17, 0), TZ)).toBe(false);
  });
});

// ─── isOpenAt — cruce de medianoche ──────────────────────────────────────────

describe('isOpenAt — cruce de medianoche (viernes 22:00-02:00)', () => {
  /** Viernes 2026-07-03 a las HH:MM hora México (UTC-6). */
  const fridayAt = (h: number, m: number): Date => {
    const utcH = h + 6;
    const dayOffset = Math.floor(utcH / 24);
    return new Date(
      `2026-07-${String(3 + dayOffset).padStart(2, '0')}T${String(utcH % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`,
    );
  };

  it('viernes 23:00 → abierto', () => {
    expect(isOpenAt(midnightCrossing, fridayAt(23, 0), TZ)).toBe(true);
  });

  it('viernes 22:00 → abierto (borde de apertura)', () => {
    expect(isOpenAt(midnightCrossing, fridayAt(22, 0), TZ)).toBe(true);
  });

  it('viernes 01:59 → abierto (madrugada, dentro del rango)', () => {
    expect(isOpenAt(midnightCrossing, fridayAt(1, 59), TZ)).toBe(true);
  });

  it('viernes 02:00 → cerrado (cierre excluido)', () => {
    expect(isOpenAt(midnightCrossing, fridayAt(2, 0), TZ)).toBe(false);
  });

  it('viernes 21:59 → cerrado (antes de apertura)', () => {
    expect(isOpenAt(midnightCrossing, fridayAt(21, 59), TZ)).toBe(false);
  });
});

// ─── isOpenAt — TZ fallback ───────────────────────────────────────────────────

describe('isOpenAt — TZ fallback', () => {
  it('usa fallbackTz cuando schedule no define timezone', () => {
    const s: WeeklyServiceSchedule = {
      days: { 1: [{ open: '09:00', close: '16:00' }] },
    };
    // La misma fecha evaluada con TZ = America/Mexico_City debe estar abierta
    expect(isOpenAt(s, mondayAt(10, 0), TZ)).toBe(true);
  });
});
