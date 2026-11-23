'use client';

import {
  BarrioSelectCombobox,
  formatBarrioLabel,
} from '@/components/domain/catalogs/BarrioSelectCombobox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePermissions } from '@/hooks/usePermissions';
import type { CitizenLeadStatus } from '@/lib/citizens-api';
import { ChevronDown, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { campaignUrl, WhatsAppIcon } from './citizen-whatsapp-actions';

interface CitizenFiltersProps {
  search: string;
  phone: string;
  leadStatus?: CitizenLeadStatus;
  neighborhood?: string;
  selectedCitizenIds?: string[];
  onSearchChange: (value: string) => void;
  onLeadStatusChange: (value?: CitizenLeadStatus) => void;
  onNeighborhoodChange: (value?: string) => void;
  onClear: () => void;
}

const LEAD_STATUS_OPTIONS: Array<{ value: CitizenLeadStatus; label: string }> = [
  { value: 'new', label: 'Nuevo Reporte' },
  { value: 'contacted', label: 'En Gestión' },
  { value: 'engaged', label: 'Canalizado' },
  { value: 'converted', label: 'Caso Resuelto' },
  { value: 'unsubscribed', label: 'Sin seguimiento' },
];

export function CitizenFilters({
  search,
  phone,
  leadStatus,
  neighborhood,
  selectedCitizenIds = [],
  onSearchChange,
  onLeadStatusChange,
  onNeighborhoodChange,
  onClear,
}: CitizenFiltersProps) {
  const { can } = usePermissions();
  const [neighborhoodLabel, setNeighborhoodLabel] = useState<string | undefined>();
  const activeFiltersCount =
    (search.trim() ? 1 : 0) +
    (phone.trim() ? 1 : 0) +
    (leadStatus ? 1 : 0) +
    (neighborhood ? 1 : 0);

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-wrap items-stretch gap-3">
        <div className="relative min-w-0 grow basis-full sm:basis-[18rem]">
          <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="min-w-0 pl-9"
            placeholder="Buscar por nombre, email o teléfono"
          />
        </div>

        <BarrioSelectCombobox
          value={neighborhood}
          selectedLabel={neighborhoodLabel}
          placeholder="Todos los barrios"
          noneLabel="Todos los barrios"
          emptyLabel="No se encontraron barrios"
          className="min-w-0 grow basis-full sm:basis-48 sm:max-w-64"
          triggerClassName="h-9 rounded-md"
          onChange={(option) => {
            setNeighborhoodLabel(
              option ? formatBarrioLabel(option.name, option.municipality) : undefined,
            );
            onNeighborhoodChange(option?.id);
          }}
        />

        <Select
          value={leadStatus ?? 'all'}
          onValueChange={(value) =>
            onLeadStatusChange(value === 'all' ? undefined : (value as CitizenLeadStatus))
          }
        >
          <SelectTrigger className="w-full min-w-0 grow basis-full sm:basis-40 sm:max-w-56">
            <SelectValue placeholder="Estado de seguimiento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estatus</SelectItem>
            {LEAD_STATUS_OPTIONS.map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(can('campanas_whatsapp.create') || can('plantillas.view')) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="ml-auto w-full gap-2 border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary sm:w-auto"
              >
                <WhatsAppIcon className="size-4" />
                Acciones WhatsApp
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {can('campanas_whatsapp.create') && can('plantillas.view') && (
                <DropdownMenuItem asChild disabled={selectedCitizenIds.length === 0}>
                  <Link href={selectedCitizenIds.length ? campaignUrl(selectedCitizenIds) : '#'}>
                    Crear Campaña ({selectedCitizenIds.length})
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {search.trim() && <Badge variant="secondary">Búsqueda: {search.trim()}</Badge>}
          {phone.trim() && <Badge variant="secondary">Tel: {phone.trim()}</Badge>}
          {leadStatus && (
            <Badge variant="secondary">
              Estado:{' '}
              {LEAD_STATUS_OPTIONS.find((item) => item.value === leadStatus)?.label ?? leadStatus}
            </Badge>
          )}
          {neighborhood && (
            <Badge variant="secondary">Barrio: {neighborhoodLabel ?? 'Seleccionado'}</Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1"
            onClick={() => {
              setNeighborhoodLabel(undefined);
              onClear();
            }}
          >
            <X className="size-3.5" />
            Limpiar filtros
          </Button>
        </div>
      )}
    </div>
  );
}
