import type { Mapping, Row } from '@/lib/shared/campaigns-api';
export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CAMPAIGN_RECIPIENTS = 2000;
// RFC 4180: quoted separators/newlines and doubled quotes; keep phones as strings.
export function parseCampaignCsv(
  text: string,
  delimiter = ',',
): { headers: string[]; rows: Row[] } {
  if (![',', ';'].includes(delimiter)) throw new Error('Separador inválido');
  const records: string[][] = [];
  let record: string[] = [],
    field = '',
    quoted = false,
    closed = false;
  const cell = () => {
    record.push(field);
    field = '';
    closed = false;
    if (record.length > 100) throw new Error('Máximo 100 columnas');
  };
  const line = () => {
    cell();
    if (record.some((value) => value.trim())) records.push(record);
    record = [];
    if (records.length > MAX_CAMPAIGN_RECIPIENTS + 1) throw new Error('Máximo 2000 destinatarios');
  };
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else field += c;
    } else if (c === delimiter) cell();
    else if (c === '\r' || c === '\n') {
      line();
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else if (c === '"' && !field && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error('Comillas CSV inválidas');
      field += c;
    }
    if (field.length > 2048) throw new Error('Una celda supera 2048 caracteres');
  }
  if (quoted) throw new Error('Hay comillas sin cerrar');
  if (field || record.length || closed) line();
  const headers = (records.shift() ?? []).map((h) => h.trim());
  if (
    !headers.length ||
    headers.some((h) => !h || h.length > 100) ||
    new Set(headers).size !== headers.length
  )
    throw new Error('Las cabeceras deben ser únicas, no vacías y de hasta 100 caracteres');
  if (!records.length) throw new Error('El CSV no tiene destinatarios');
  const rows = records.map((values, i) => {
    if (values.length !== headers.length)
      throw new Error(`Registro ${i + 2}: cantidad de columnas incorrecta`);
    return Object.fromEntries(headers.map((key, j) => [key, values[j]]));
  });
  return { headers, rows };
}
export function validateCampaignRows(
  rows: Row[],
  phoneColumn: string,
  mappings: Record<string, Mapping>,
  keys: string[],
): string | undefined {
  const phones = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const phone = (rows[i][phoneColumn] ?? '')
      .trim()
      .replace(/[\s().-]/g, '')
      .replace(/^\+/, '');
    if (!/^[1-9]\d{7,14}$/.test(phone))
      return `Registro ${i + 1}: teléfono inválido; incluye código de país`;
    if (phones.has(phone)) return `Registro ${i + 1}: teléfono duplicado`;
    phones.add(phone);
    for (const key of keys) {
      const rule = mappings[key];
      const value =
        rule?.mode === 'static' ? rule.value : rule?.mode === 'dynamic' ? rows[i][rule.field] : '';
      if (!value?.trim() || value.length > 1024 || /[\r\n\t]/.test(value))
        return `Registro ${i + 1}: completa un valor válido para ${key}`;
    }
  }
}
