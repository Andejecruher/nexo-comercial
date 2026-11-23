'use client';

import {
  formatSectionMetric,
  type CatalogTarget,
} from '@/components/admin/electoral-catalog/catalog-types';
import { PaginationControls } from '@/components/domain/catalogs/PaginationControls';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableAction } from '@/components/ui/table-action';
import { TableStatusBadge } from '@/components/ui/table-status-badge';
import { TableEmptyState, TableSkeleton } from '@/components/ui/table-states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ElectoralDistrict, ElectoralSection, ElectoralState } from '@/lib/ine-ocr-api';
import { cn } from '@/lib/utils';
import { Edit3, MapPin, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';

type CatalogTab = 'states' | 'districts' | 'sections';

interface CatalogTableProps {
  states: ElectoralState[];
  districts: ElectoralDistrict[];
  sections: ElectoralSection[];
  loading: boolean;
  busy: boolean;
  selectedRowId?: string;
  onCreate: () => void;
  onSelectRow: (target: CatalogTarget) => void;
  onRefresh: () => void;
  onEdit: (target: CatalogTarget) => void;
  onDelete: (target: CatalogTarget) => void;
  onReactivate: (target: CatalogTarget) => void;
}

const PAGE_SIZE = 10;

export function CatalogTable({
  states,
  districts,
  sections,
  loading,
  busy,
  selectedRowId,
  onCreate,
  onSelectRow,
  onRefresh,
  onEdit,
  onDelete,
  onReactivate,
}: CatalogTableProps) {
  const [activeTab, setActiveTab] = useState<CatalogTab>('states');
  const [currentPage, setCurrentPage] = useState(1);

  const activeItems = useMemo(() => {
    switch (activeTab) {
      case 'states':
        return states;
      case 'districts':
        return districts;
      case 'sections':
        return sections;
    }
  }, [activeTab, districts, sections, states]);

  const pageCount = Math.max(1, Math.ceil(activeItems.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount));
  }, [pageCount]);

  const firstIndex = (currentPage - 1) * PAGE_SIZE;

  const selectableRow = (target: CatalogTarget) => {
    const isSelected = selectedRowId === target.item.id;
    return {
      tabIndex: 0,
      'aria-selected': isSelected,
      onClick: () => onSelectRow(target),
      onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onSelectRow(target);
      },
      className: cn(
        'cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
        isSelected && 'border-l-2 border-l-primary bg-primary/5 hover:bg-slate-50/50',
      ),
    };
  };

  return (
    <Card
      className="gap-0 overflow-hidden border-border/80 py-0 shadow-sm"
      aria-labelledby="catalog-list-title"
      aria-busy={loading}
    >
      <CardHeader className="flex flex-col gap-3 border-b bg-muted/20 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle id="catalog-list-title" className="text-base font-bold tracking-tight">
            Catálogo existente
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Consultá y administrá cada nivel de la jerarquía electoral.
          </p>
        </div>
        <Button
          type="button"
          onClick={onCreate}
          disabled={busy}
          className="h-10 gap-2 self-start rounded-lg bg-primary px-4 font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-md sm:self-auto"
        >
          <Plus aria-hidden="true" className="size-4" />
          Nuevo registro jerárquico
        </Button>
      </CardHeader>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setActiveTab(value as CatalogTab);
          setCurrentPage(1);
        }}
        className="gap-0"
      >
        <div className="flex flex-col gap-3 border-b bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="overflow-x-auto pb-1 sm:pb-0">
            <TabsList className="h-10 min-w-max justify-start bg-muted/60">
              <CatalogTabTrigger value="states" label="Estados" count={states.length} />
              <CatalogTabTrigger value="districts" label="Distritos" count={districts.length} />
              <CatalogTabTrigger value="sections" label="Secciones" count={sections.length} />
            </TabsList>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={busy}
            className="gap-2 self-start rounded-lg sm:self-auto"
          >
            <RefreshCw aria-hidden="true" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar listado
          </Button>
        </div>

        <CardContent className="px-0">
          <TabsContent value="states" className="mt-0">
            <CatalogTableShell
              loading={loading}
              empty={states.length === 0}
              headers={['ID', 'Código', 'Nombre', 'Estado', 'Acciones']}
            >
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-slate-50">
                    <TableHead>ID</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {states.slice(firstIndex, firstIndex + PAGE_SIZE).map((state) => (
                    <TableRow key={state.id} {...selectableRow({ type: 'state', item: state })}>
                      <TableCell>
                        <RecordId id={state.id} />
                      </TableCell>
                      <TableCell className="font-semibold">{state.code}</TableCell>
                      <TableCell>{state.name}</TableCell>
                      <TableCell>
                        <StatusBadge isActive={state.isActive} />
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          target={{ type: 'state', item: state }}
                          busy={busy}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          onReactivate={onReactivate}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CatalogTableShell>
          </TabsContent>

          <TabsContent value="districts" className="mt-0">
            <CatalogTableShell
              loading={loading}
              empty={districts.length === 0}
              headers={['ID', 'Código', 'Nombre', 'Estado electoral', 'Estado', 'Acciones']}
            >
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-slate-50">
                    <TableHead>ID</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado electoral</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {districts.slice(firstIndex, firstIndex + PAGE_SIZE).map((district) => (
                    <TableRow
                      key={district.id}
                      {...selectableRow({ type: 'district', item: district })}
                    >
                      <TableCell>
                        <RecordId id={district.id} />
                      </TableCell>
                      <TableCell className="font-semibold">{district.code}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {district.name || '—'}
                      </TableCell>
                      <TableCell>{district.state.name}</TableCell>
                      <TableCell>
                        <StatusBadge isActive={district.isActive} />
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          target={{ type: 'district', item: district }}
                          busy={busy}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          onReactivate={onReactivate}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CatalogTableShell>
          </TabsContent>

          <TabsContent value="sections" className="mt-0">
            <CatalogTableShell
              loading={loading}
              empty={sections.length === 0}
              headers={[
                'ID',
                'Sección',
                'Estado electoral',
                'Distrito',
                'Casillas',
                'Votos/casilla',
                'Lista nom.',
                'Votos nec.',
                'Estado',
                'Acciones',
              ]}
            >
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-slate-50">
                    <TableHead>ID</TableHead>
                    <TableHead>Sección</TableHead>
                    <TableHead>Estado electoral</TableHead>
                    <TableHead>Distrito</TableHead>
                    <TableHead>Casillas</TableHead>
                    <TableHead>Votos/casilla</TableHead>
                    <TableHead>Lista nom.</TableHead>
                    <TableHead>Votos nec.</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sections.slice(firstIndex, firstIndex + PAGE_SIZE).map((section) => (
                    <TableRow
                      key={section.id}
                      {...selectableRow({ type: 'section', item: section })}
                    >
                      <TableCell>
                        <RecordId id={section.id} />
                      </TableCell>
                      <TableCell className="font-semibold">{section.sectionCode}</TableCell>
                      <TableCell>{section.state.name}</TableCell>
                      <TableCell>Distrito {section.district.code}</TableCell>
                      <TableCell>{formatSectionMetric(section.pollingStationCount)}</TableCell>
                      <TableCell>{formatSectionMetric(section.votesPerStation)}</TableCell>
                      <TableCell>{formatSectionMetric(section.nominalList)}</TableCell>
                      <TableCell>{formatSectionMetric(section.votesRequired)}</TableCell>
                      <TableCell>
                        <StatusBadge isActive={section.isActive} />
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          target={{ type: 'section', item: section }}
                          busy={busy}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          onReactivate={onReactivate}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CatalogTableShell>
          </TabsContent>
        </CardContent>
      </Tabs>

      <PaginationControls
        currentPage={currentPage}
        hasNextPage={currentPage < pageCount}
        hasPreviousPage={currentPage > 1}
        totalCount={activeItems.length}
        loading={loading}
        onNext={() => setCurrentPage((page) => Math.min(page + 1, pageCount))}
        onPrevious={() => setCurrentPage((page) => Math.max(page - 1, 1))}
        onFirst={() => setCurrentPage(1)}
      />
    </Card>
  );
}

function CatalogTabTrigger({
  value,
  label,
  count,
}: {
  value: CatalogTab;
  label: string;
  count: number;
}) {
  return (
    <TabsTrigger value={value} className="gap-2 px-3 text-xs sm:text-sm">
      {label}
      <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-[10px]">
        {count}
      </Badge>
    </TabsTrigger>
  );
}

function CatalogTableShell({
  loading,
  empty,
  headers,
  children,
}: {
  loading: boolean;
  empty: boolean;
  headers: string[];
  children: ReactNode;
}) {
  if (loading) return <TableSkeleton headers={headers} />;
  if (empty)
    return <TableEmptyState icon={MapPin} title="Todavía no hay registros en esta categoría" />;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
      {children}
    </div>
  );
}

function RecordId({ id }: { id: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <code className="cursor-help rounded bg-muted px-2 py-1 text-xs">{id.slice(0, 8)}…</code>
      </TooltipTrigger>
      <TooltipContent>{id}</TooltipContent>
    </Tooltip>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return <TableStatusBadge active={isActive} />;
}

function RowActions({
  target,
  busy,
  onEdit,
  onDelete,
  onReactivate,
}: {
  target: CatalogTarget;
  busy: boolean;
  onEdit: (target: CatalogTarget) => void;
  onDelete: (target: CatalogTarget) => void;
  onReactivate: (target: CatalogTarget) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <ActionButton label="Editar registro" disabled={busy} onClick={() => onEdit(target)}>
        <Edit3 aria-hidden="true" className="size-4" />
      </ActionButton>
      {target.item.isActive ? (
        <ActionButton
          label="Desactivar registro"
          disabled={busy}
          destructive
          onClick={() => onDelete(target)}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </ActionButton>
      ) : (
        <ActionButton
          label="Reactivar registro"
          disabled={busy}
          onClick={() => onReactivate(target)}
        >
          <RotateCcw aria-hidden="true" className="size-4" />
        </ActionButton>
      )}
    </div>
  );
}

function ActionButton({
  label,
  disabled,
  destructive = false,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  destructive?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TableAction
          type="button"
          disabled={disabled}
          label={label}
          onClick={onClick}
          tone={destructive ? 'danger' : 'primary'}
        >
          {children}
        </TableAction>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
