import { describe, expect, it } from 'vitest';
import { parseCampaignCsv, validateCampaignRows } from './campaign-csv';

describe('campaign CSV', () => {
  it('preserves phones and parses BOM, quoted delimiters, doubled quotes and newlines', () => {
    const parsed = parseCampaignCsv(
      '\uFEFFtelefono,nombre,nota\r\n+525512345678,"Ana, María","Dijo ""hola""\ny adiós"\r\n',
    );
    expect(parsed.headers).toEqual(['telefono', 'nombre', 'nota']);
    expect(parsed.rows).toEqual([
      { telefono: '+525512345678', nombre: 'Ana, María', nota: 'Dijo "hola"\ny adiós' },
    ]);
  });
  it.each([
    'phone,phone\n123,456',
    'phone,\n123,456',
    'phone,name\n123',
    'phone\n"123',
    'phone\n"123"oops',
  ])('rejects invalid or ambiguous CSV: %s', (text) => {
    expect(() => parseCampaignCsv(text)).toThrow();
  });
  it('supports a semicolon delimiter and keeps leading zeroes in strings', () => {
    expect(parseCampaignCsv('phone;code\n+525512345678;001', ';').rows[0].code).toBe('001');
  });
  it('detects normalization duplicates and missing values beyond the preview row', () => {
    expect(
      validateCampaignRows([{ p: '+52 5512345678' }, { p: '525512345678' }], 'p', {}, []),
    ).toContain('duplicado');
    expect(
      validateCampaignRows(
        [
          { p: '525512345678', name: 'Ana' },
          { p: '525512345679', name: '' },
        ],
        'p',
        { 'body.1': { mode: 'dynamic', field: 'name' } },
        ['body.1'],
      ),
    ).toContain('Registro 2');
  });
  it('caps large imports before constructing row objects', () => {
    expect(() => parseCampaignCsv('p\n' + '525512345678\n'.repeat(2001))).toThrow('2000');
  });
});
