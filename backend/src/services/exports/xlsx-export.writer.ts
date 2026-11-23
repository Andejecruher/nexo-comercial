import ExcelJS from 'exceljs';
import { PassThrough } from 'node:stream';
import { env } from '../../config/env.config';
import type { PrismaService } from '../prisma.service';
import { resolveExportModule } from './module-export-config';

type ExportJobInput = { module: string; filtersJson: unknown; scopeSnapshot: unknown };

export class XlsxExportWriter {
  constructor(private readonly prisma: PrismaService) {}

  async write(
    job: ExportJobInput,
    output = new PassThrough({ highWaterMark: 256 * 1024 }),
  ): Promise<number> {
    const config = resolveExportModule(job.module);
    const filters = config.filterSchema.parse(job.filtersJson);
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: output,
      useStyles: true,
      useSharedStrings: false,
    });
    const sheet = workbook.addWorksheet('Export', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = config.columns.map((column) => ({
      key: column.key,
      width: column.width ?? Math.max(14, column.header.length + 2),
      numFmt: column.numFmt,
    }));
    const header = sheet.addRow(config.columns.map((column) => column.header));
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFB7C9D6' } } };
    });
    header.commit();
    sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + config.columns.length)}1` };

    let count = 0;
    let cursor: string | undefined;
    do {
      const rows = await config.fetchPage(this.prisma, job.scopeSnapshot as never, filters, cursor);
      for (const row of rows) {
        const excelRow = sheet.addRow(config.columns.map((column) => row[column.key] ?? ''));
        config.columns.forEach((column, index) => {
          if (column.numFmt) excelRow.getCell(index + 1).numFmt = column.numFmt;
        });
        excelRow.commit();
        count += 1;
      }
      cursor = rows.at(-1)?.id as string | undefined;
      if (rows.length < env.EXPORT_BATCH_SIZE) break;
    } while (cursor);
    await workbook.commit();
    return count;
  }
}
