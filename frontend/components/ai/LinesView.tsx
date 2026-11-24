'use client';

import { LineForm } from '@/components/ai/LineForm';
import { Badge } from '@/components/ui/badge';
import { TableStatusBadge } from '@/components/ui/table-status-badge';
import { Button } from '@/components/ui/button';
import { PaginationControls } from '@/components/shared/catalogs/PaginationControls';
import { TableAction } from '@/components/ui/table-action';
import { TableEmptyState, TableSkeleton } from '@/components/ui/table-states';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAgents } from '@/hooks/ai/useAgents';
import { useLines } from '@/hooks/shared/useLines';
import type { CommunicationLine } from '@/lib/shared/ai-api';
import { Phone, Plus, RefreshCw, Search, Settings, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';

export function LinesView() {
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<CommunicationLine | undefined>(undefined);

  const {
    lines,
    loading,
    error,
    totalCount,
    hasNextPage,
    hasPreviousPage,
    currentPage,
    refresh,
    nextPage,
    previousPage,
    createLine,
    updateLine,
  } = useLines({ search: search || undefined });

  const { agents } = useAgents({ isActive: true });

  const openCreate = () => {
    setEditingLine(undefined);
    setFormOpen(true);
  };

  const openEdit = (line: CommunicationLine) => {
    setEditingLine(line);
    setFormOpen(true);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Líneas de comunicación</h2>
            <p className="text-xs text-muted-foreground">{totalCount} línea(s) en total</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5" />
            Nueva línea
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={refresh}
            disabled={loading}
            aria-label="Actualizar tabla"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-muted/30 shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar líneas…"
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <TableSkeleton
            headers={['Línea', 'Canal', 'Identificador', 'Estado', 'IA', 'Agente', 'Acciones']}
          />
        ) : lines.length === 0 ? (
          <TableEmptyState icon={Phone} title="No hay líneas registradas">
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus className="size-4" /> Crear primera línea
            </Button>
          </TableEmptyState>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Línea</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Identificador</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>IA</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead className="w-24 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-semibold">{line.displayName}</p>
                        {line.phoneNumber && (
                          <p className="text-xs text-muted-foreground font-mono">
                            {line.phoneNumber}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {line.channel}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {line.externalIdentifier}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <TableStatusBadge
                          active={line.isActive}
                          activeLabel="Activa"
                          inactiveLabel="Inactiva"
                          className="w-fit"
                        />
                        {line.isDefault && (
                          <Badge variant="outline" className="text-xs w-fit">
                            Por defecto
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {line.aiEnabled ? (
                        <div className="flex items-center gap-1 text-primary">
                          <Wifi className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium">Habilitada</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <WifiOff className="w-3.5 h-3.5" />
                          <span className="text-xs">Deshabilitada</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {line.agent ? (
                        <div>
                          <p className="text-xs font-medium">{line.agent.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {line.agent.provider} / {line.agent.model}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin agente</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <TableAction onClick={() => openEdit(line)} label="Configurar línea">
                        <Settings className="w-3.5 h-3.5" />
                      </TableAction>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {(hasNextPage || hasPreviousPage) && (
        <PaginationControls
          currentPage={currentPage}
          hasNextPage={hasNextPage}
          hasPreviousPage={hasPreviousPage}
          totalCount={totalCount}
          loading={loading}
          onFirst={refresh}
          onPrevious={previousPage}
          onNext={nextPage}
        />
      )}

      {/* Shared create/edit dialog */}
      <LineForm
        open={formOpen}
        line={editingLine}
        availableAgents={agents}
        onClose={() => {
          setFormOpen(false);
          setEditingLine(undefined);
        }}
        onCreate={createLine}
        onUpdate={updateLine}
      />
    </div>
  );
}
