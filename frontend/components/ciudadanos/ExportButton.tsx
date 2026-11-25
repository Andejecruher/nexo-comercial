'use client';

import { Button } from '@/components/ui/button';
import { useExportJob } from '@/hooks/ciudadanos/useExportJob';
import type { ExportModule } from '@/lib/ciudadanos/exports-api';
import { FileSpreadsheet, Loader2 } from 'lucide-react';

const MODULE_LABELS: Record<ExportModule, string> = {
  citizens: 'Ciudadanos',
};

export function ExportButton({
  module,
  filters,
  enabled,
}: {
  module: ExportModule;
  filters: Record<string, unknown>;
  enabled?: boolean;
}) {
  const exportJob = useExportJob();
  const visible = enabled ?? exportJob.enabled;
  if (!visible) return null;
  const label = `Exportar ${MODULE_LABELS[module] ?? module} a Excel`;
  return (
    <Button
      variant="outline"
      disabled={exportJob.exporting}
      aria-busy={exportJob.exporting}
      aria-label={label}
      title={label}
      onClick={() => void exportJob.start(module, filters)}
    >
      {exportJob.exporting ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
      )}
      {exportJob.exporting ? 'Generando…' : 'Exportar Excel'}
    </Button>
  );
}
