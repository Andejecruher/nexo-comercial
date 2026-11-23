import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Workbook } from 'exceljs';
import { PassThrough } from 'node:stream';
import { env } from '../../../config/env.config';
import { XlsxExportWriter } from '../../../services/exports/xlsx-export.writer';

const originalBatchSize = env.EXPORT_BATCH_SIZE;

afterEach(() => {
  env.EXPORT_BATCH_SIZE = originalBatchSize;
});

function citizen(id: string, name: string) {
  return {
    id,
    name,
    lastName: 'Test',
    phone: '521999888777',
    email: `${name.toLowerCase()}@example.com`,
    leadStatus: 'new',
    neighborhood: 'Centro',
    createdAt: new Date('2026-09-07T10:00:00Z'),
  };
}

async function writeWorkbook(pages: unknown[][]) {
  const findMany = jest.fn(async () => pages.shift() ?? []);
  const writer = new XlsxExportWriter({ citizen: { findMany } } as never);
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

  const rowCount = await writer.write(
    {
      module: 'citizens',
      filtersJson: { search: 'test' },
      scopeSnapshot: { kind: 'admin' },
    },
    output,
  );

  return {
    rowCount,
    findMany,
    workbook: await new Workbook().xlsx.load(Buffer.concat(chunks) as never),
  };
}

describe('XlsxExportWriter', () => {
  it('streams retained citizen rows across cursor pages', async () => {
    env.EXPORT_BATCH_SIZE = 2;
    const first = citizen('citizen-1', 'Ana');
    const second = citizen('citizen-2', 'Beto');
    const third = citizen('citizen-3', 'Carla');

    const { rowCount, findMany, workbook } = await writeWorkbook([
      [first, second],
      [third],
    ]);

    expect(rowCount).toBe(3);
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        cursor: { id: second.id },
        skip: 1,
      }),
    );
    const sheet = workbook.worksheets[0];
    expect(sheet.rowCount).toBe(4);
    expect(sheet.getRow(2).getCell(2).value).toBe('Ana Test');
  });

  it('keeps identifiers as text and dates as dates', async () => {
    const { workbook } = await writeWorkbook([[citizen('00123', 'Ana')]]);
    const row = workbook.worksheets[0].getRow(2);

    expect(row.getCell(1).numFmt).toBe('@');
    expect(row.getCell(1).value).toBe('00123');
    expect(row.getCell(7).numFmt).toBe('dd/mm/yyyy');
    expect(row.getCell(7).value).toBeInstanceOf(Date);
  });

  it('rejects removed export modules before writing a workbook', async () => {
    const writer = new XlsxExportWriter({} as never);

    await expect(
      writer.write({
        module: 'promoted',
        filtersJson: {},
        scopeSnapshot: { kind: 'admin' },
      }),
    ).rejects.toThrow('Unsupported export module');
  });
});
