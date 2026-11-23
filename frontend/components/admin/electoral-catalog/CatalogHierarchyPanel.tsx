'use client';

import type { CatalogTarget } from '@/components/admin/electoral-catalog/catalog-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ElectoralDistrict, ElectoralSection, ElectoralState } from '@/lib/ine-ocr-api';
import { Layers } from 'lucide-react';

interface CatalogHierarchyPanelProps {
  target?: CatalogTarget;
  states: ElectoralState[];
  districts: ElectoralDistrict[];
  sections: ElectoralSection[];
}

interface HierarchyRow {
  level: string;
  id: string;
  code: string;
  name: string;
}

export function CatalogHierarchyPanel({
  target,
  states,
  districts,
  sections,
}: CatalogHierarchyPanelProps) {
  const rows = target ? buildHierarchy(target, states, districts, sections) : [];

  return (
    <Card className="gap-0 self-start overflow-hidden border-border/80 py-0 shadow-sm">
      <CardHeader className="border-b bg-muted/20 px-5 py-5">
        <CardTitle className="text-base font-bold tracking-tight">Resumen jerárquico</CardTitle>
        <p className="text-xs text-muted-foreground">
          Seleccioná una fila de la tabla para ver su cadena completa.
        </p>
      </CardHeader>

      <CardContent className="space-y-5 px-5 py-5">
        <dl className="grid grid-cols-2 gap-3">
          <CountTile label="Estados" value={states.length} />
          <CountTile label="Distritos" value={districts.length} />
          <CountTile label="Secciones" value={sections.length} />
        </dl>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/20 px-4 py-8 text-center">
            <Layers aria-hidden="true" className="size-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Todavía no hay ningún registro seleccionado.
            </p>
          </div>
        ) : (
          <ol className="space-y-2">
            {rows.map((row) => (
              <li key={`${row.level}-${row.id}`} className="rounded-lg border bg-background p-3">
                <p className="text-[11px] font-bold tracking-wide text-primary uppercase">
                  {row.level}
                </p>
                <p className="mt-1 text-sm font-semibold">{row.code}</p>
                <p className="text-xs text-muted-foreground">{row.name}</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <code className="mt-2 inline-block cursor-help rounded bg-muted px-2 py-0.5 text-[11px]">
                      {row.id.slice(0, 8)}…
                    </code>
                  </TooltipTrigger>
                  <TooltipContent>{row.id}</TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-lg font-black tracking-tight">{value}</dd>
    </div>
  );
}

function buildHierarchy(
  target: CatalogTarget,
  states: ElectoralState[],
  districts: ElectoralDistrict[],
  sections: ElectoralSection[],
): HierarchyRow[] {
  const stateRow = (stateId: string): HierarchyRow[] => {
    const state = states.find((item) => item.id === stateId);
    return state ? [{ level: 'Estado', id: state.id, code: state.code, name: state.name }] : [];
  };
  const districtRow = (districtId: string): HierarchyRow[] => {
    const district = districts.find((item) => item.id === districtId);
    return district
      ? [
          {
            level: 'Distrito',
            id: district.id,
            code: `Distrito ${district.code}`,
            name: district.name || '—',
          },
        ]
      : [];
  };
  const sectionRow = (sectionId: string): HierarchyRow[] => {
    const section = sections.find((item) => item.id === sectionId);
    return section
      ? [
          {
            level: 'Sección',
            id: section.id,
            code: `Sección ${section.sectionCode}`,
            name: `${section.leaders.length} líder(es) asociados`,
          },
        ]
      : [];
  };

  switch (target.type) {
    case 'state':
      return stateRow(target.item.id);
    case 'district':
      return [...stateRow(target.item.stateId), ...districtRow(target.item.id)];
    case 'section':
      return [
        ...stateRow(target.item.stateId),
        ...districtRow(target.item.districtId),
        ...sectionRow(target.item.id),
      ];
  }
}
