import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Workbook } from 'exceljs';
import { PassThrough } from 'node:stream';
import { XlsxExportWriter } from '../../../services/exports/xlsx-export.writer';
import * as moduleExportConfig from '../../../services/exports/module-export-config';
import { resolveExportModule } from '../../../services/exports/module-export-config';
import { encrypt } from '../../../utils/crypto';
import { env } from '../../../config/env.config';

const SECRET = {
  curp: 'CURP00112233445566',
  voterKey: 'VK99001122',
  address: 'Calle Real 123 Col. Centro',
  phone: '555 100 2000',
  firstName: 'Ana',
  paternalLastName: 'Paz',
  maternalLastName: 'Luz',
};

const requestedAt = new Date('2026-09-06T14:32:00Z');

env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

function promovidoRows(offset: number, size: number): Array<Record<string, unknown>> {
  return Array.from({ length: size }, (_, i) => ({
    id: `prom-${offset + i}`,
    dataEncrypted: encrypt(JSON.stringify(SECRET)),
    leader: { fullName: 'Líder Uno' },
    section: { sectionCode: `SEC-${offset + i}` },
    isActive: true,
    createdAt: requestedAt,
  }));
}

function pageable(pages: Array<Array<Record<string, unknown>>>) {
  const pageQueue = [...pages];
  return jest.fn(async () => pageQueue.shift() ?? []);
}

async function writePromoted(pages: Array<Array<Record<string, unknown>>>, scopeSnapshot?: unknown) {
  const findMany = pageable(pages);
  const prisma = { promovido: { findMany } } as never;
  const writer = new XlsxExportWriter(prisma);
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  const rowCount = await writer.write(
    { module: 'promoted', filtersJson: { q: 'ana' }, scopeSnapshot },
    output,
  );
  return {
    rowCount,
    buffer: Buffer.concat(chunks),
    chunks,
    findMany,
    chunkCount: chunks.length,
  };
}

function leaderRows(size: number): Array<Record<string, unknown>> {
  return Array.from({ length: size }, (_, i) => ({
    id: `ldr-${i}`,
    fullName: `Líder ${i}`,
    email: `lider${i}@test`,
    phone: `555 000 ${i}`,
    coordinator: { fullName: `Coord ${i}` },
    section: { sectionCode: `SEC-${i}` },
    isActive: true,
    createdAt: requestedAt,
  }));
}

async function writeLeaders(pages: Array<Array<Record<string, unknown>>>) {
  const findMany = pageable(pages);
  const prisma = { leader: { findMany } } as never;
  const writer = new XlsxExportWriter(prisma);
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  const rowCount = await writer.write(
    { module: 'leaders', filtersJson: { q: 'x' }, scopeSnapshot: undefined },
    output,
  );
  return { rowCount, buffer: Buffer.concat(chunks), findMany, chunkCount: chunks.length };
}

const originalBatchSize = env.EXPORT_BATCH_SIZE;

beforeEach(() => {
  env.EXPORT_BATCH_SIZE = 1_000;
});

afterEach(() => {
  env.EXPORT_BATCH_SIZE = originalBatchSize;
});

describe('XlsxExportWriter', () => {
  it('produces a styled header, frozen view, autoFilter, and 3,500 data rows', async () => {
    const pages = [
      promovidoRows(0, 1_000),
      promovidoRows(1_000, 1_000),
      promovidoRows(2_000, 1_000),
      promovidoRows(3_000, 500),
    ];
    const { rowCount, buffer, findMany, chunkCount } = await writePromoted(pages);
    expect(rowCount).toBe(3_500);
    expect(findMany).toHaveBeenCalledTimes(4);
    expect(chunkCount).toBeGreaterThan(50);

    const workbook = await new Workbook().xlsx.load(buffer as never);
    const sheet = workbook.worksheets[0];
    expect(sheet.name).toBe('Export');
    expect(sheet.rowCount).toBe(3_501);

    const header = sheet.getRow(1);
    expect(header.getCell(1).value).toBe('ID');
    expect(header.getCell(3).value).toBe('CURP');
    expect(header.getCell(4).value).toBe('Clave de elector');
    expect(header.getCell(10).value).toBe('Fecha de registro');
    expect(header.getCell(1).font.bold).toBe(true);

    expect(sheet.views?.[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(JSON.stringify(sheet.autoFilter)).toContain('A1');

    expect(sheet.getRow(3_501).getCell(1).value).toBe('prom-3499');
  });

  it('paginates every batch with a stable id-asc cursor and no duplicates or gaps', async () => {
    const pages = [
      promovidoRows(0, 1_000),
      promovidoRows(1_000, 1_000),
      promovidoRows(2_000, 1_000),
      promovidoRows(3_000, 500),
    ];
    const { rowCount, findMany } = await writePromoted(pages);
    expect(rowCount).toBe(3_500);

    const calls = findMany.mock.calls as unknown as Array<Array<Record<string, unknown>>>;
    expect(calls).toHaveLength(4);
    expect(calls[0][0]).toMatchObject({ take: 1_000, orderBy: { id: 'asc' } });
    expect(calls[0][0].cursor).toBeUndefined();
    expect(calls[1][0]).toMatchObject({ cursor: { id: 'prom-999' }, skip: 1 });
    expect(calls[2][0]).toMatchObject({ cursor: { id: 'prom-1999' }, skip: 1 });
    expect(calls[3][0]).toMatchObject({ cursor: { id: 'prom-2999' }, skip: 1 });
    for (const call of calls) {
      expect(call[0].orderBy).toEqual({ id: 'asc' });
      expect(call[0].take).toBe(1_000);
    }
  });

  it('reapplies the stored scope snapshot on every batch query', async () => {
    env.EXPORT_BATCH_SIZE = 2;
    const snapshot = { kind: 'leader', leaderId: 'leader-42' };
    const pages = [promovidoRows(0, 2), promovidoRows(2, 1)];
    const { rowCount, findMany } = await writePromoted(pages, snapshot);
    expect(rowCount).toBe(3);
    const calls = findMany.mock.calls as unknown as Array<Array<Record<string, unknown>>>;
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call[0].where).toMatchObject({ leader: { id: 'leader-42' } });
    }
    expect((calls[0][0].where as Record<string, { id: string }>).leader.id).toBe(
      (calls[1][0].where as Record<string, { id: string }>).leader.id,
    );
  });

  it('does not widen the export when the session scope changes after creation', async () => {
    env.EXPORT_BATCH_SIZE = 2;
    const originalSnapshot = { kind: 'leader', leaderId: 'leader-42' };
    const pages = [promovidoRows(0, 2), promovidoRows(2, 1)];
    const findMany = jest.fn(async () => pages.shift() ?? []);
    const prisma = { promovido: { findMany } } as never;
    const writer = new XlsxExportWriter(prisma);
    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

    const jobStorage = { scopeSnapshot: { ...originalSnapshot } };
    const rowCount = await writer.write(
      { module: 'promoted', filtersJson: { q: 'ana' }, scopeSnapshot: jobStorage.scopeSnapshot },
      output,
    );

    jobStorage.scopeSnapshot.leaderId = 'leader-99';

    expect(rowCount).toBe(3);
    const calls = findMany.mock.calls as unknown as Array<Array<Record<string, unknown>>>;
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call[0].where).toMatchObject({ leader: { id: 'leader-42' } });
      expect((call[0].where as Record<string, { id: string }>).leader.id).not.toBe('leader-99');
    }
  });

  it('applies numFmt per cell type and stores typed values', async () => {
    const { buffer } = await writePromoted([promovidoRows(0, 1)]);
    const workbook = await new Workbook().xlsx.load(buffer as never);
    const sheet = workbook.worksheets[0];
    const row = sheet.getRow(2);
    expect(row.getCell(1).value).toBe('prom-0');
    expect(row.getCell(2).value).toBe('Ana Paz Luz');
    expect(row.getCell(10).numFmt).toBe('dd/mm/yyyy');
    expect(row.getCell(10).value).toBeInstanceOf(Date);
    const promoted = resolveExportModule('promoted');
    expect(promoted.columns.map((c) => c.numFmt)).toEqual(
      expect.arrayContaining(['@', 'dd/mm/yyyy']),
    );
  });

  it('applies a numeric numFmt to numeric cells exported by a module', async () => {
    const numericConfig = {
      module: 'promoted',
      subfolder: 'promoted',
      filterSchema: {
        parse: () => ({}),
      },
      columns: [
        { header: 'ID', key: 'id', numFmt: '@' },
        { header: 'Score', key: 'score', numFmt: '#,##0.00' },
      ],
      fetchPage: async () => [{ id: 'prom-0', score: 1234.567 }],
    };
    const spy = jest.spyOn(moduleExportConfig, 'resolveExportModule').mockReturnValue(
      numericConfig as never,
    );

    try {
      const writer = new XlsxExportWriter({} as never);
      const output = new PassThrough();
      const chunks: Buffer[] = [];
      output.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      await writer.write({ module: 'promoted', filtersJson: {}, scopeSnapshot: undefined }, output);

      const sheet = (await new Workbook().xlsx.load(Buffer.concat(chunks) as never)).worksheets[0];
      const dataRow = sheet.getRow(2);
      expect(dataRow.getCell(2).value).toBe(1234.567);
      expect(dataRow.getCell(2).numFmt).toBe('#,##0.00');
      expect(dataRow.getCell(1).numFmt).toBe('@');
    } finally {
      spy.mockRestore();
    }
  });

  it('reveals encrypted Promovido sensitive fields in cleartext', async () => {
    const { buffer } = await writePromoted([promovidoRows(0, 1)]);
    const workbook = await new Workbook().xlsx.load(buffer as never);
    const row = workbook.worksheets[0].getRow(2);
    expect(row.getCell(2).value).toBe('Ana Paz Luz');
    expect(row.getCell(3).value).toBe(SECRET.curp);
    expect(row.getCell(4).value).toBe(SECRET.voterKey);
    expect(row.getCell(5).value).toBe(SECRET.address);
    expect(row.getCell(6).value).toBe(SECRET.phone);
  });

  it('streams 20,000 rows through the PassThrough in bounded chunks', async () => {
    const pages = Array.from({ length: 20 }, (_, i) => promovidoRows(i * 1_000, 1_000));
    const { rowCount, buffer, chunks, findMany, chunkCount } = await writePromoted(pages);
    expect(rowCount).toBe(20_000);
    expect(findMany).toHaveBeenCalledTimes(21);
    expect(chunkCount).toBeGreaterThan(100);
    expect(buffer.length).toBeGreaterThan(100_000);
    const maxChunk = Math.max(...chunks.map((chunk) => chunk.length));
    expect(maxChunk).toBeLessThan(buffer.length / 2);
    const bufferedAtOnce = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    expect(bufferedAtOnce).toBeGreaterThanOrEqual(buffer.length);
  });

  it('writes a leader workbook without any sensitive reveal columns', async () => {
    const { rowCount, buffer, findMany } = await writeLeaders([leaderRows(1)]);
    expect(rowCount).toBe(1);
    const sheet = (await new Workbook().xlsx.load(buffer as never)).worksheets[0];
    const headerValues = (sheet.getRow(1).values as Array<string | undefined>)
      .filter(Boolean)
      .map((value) => String(value));
    expect(headerValues).not.toContain('CURP');
    expect(headerValues).not.toContain('Voter key');
    expect(headerValues).toContain('Nombre completo');
    expect(headerValues).toContain('Fecha de registro');
    const dataRow = sheet.getRow(2);
    expect(dataRow.getCell(1).value).toBe('ldr-0');
    expect(dataRow.getCell(3).value).toBe('lider0@test');
    expect(dataRow.getCell(8).numFmt).toBe('dd/mm/yyyy');
    expect(dataRow.getCell(8).value).toBeInstanceOf(Date);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('exposes only the standard leader columns without sensitive reveal keys', () => {
    const leaders = resolveExportModule('leaders');
    expect(leaders.columns.map((c) => c.key)).toEqual(
      expect.arrayContaining(['fullName', 'email', 'phone']),
    );
    expect(leaders.columns.map((c) => c.key)).not.toEqual(
      expect.arrayContaining(['curp', 'voterKey', 'address']),
    );
    const promoted = resolveExportModule('promoted');
    expect(promoted.columns.map((c) => c.key)).toEqual(
      expect.arrayContaining(['curp', 'voterKey']),
    );
  });
});