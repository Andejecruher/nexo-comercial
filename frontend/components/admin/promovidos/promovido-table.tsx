'use client';

import { TableStatusBadge } from '@/components/ui/table-status-badge';
import { TableAction } from '@/components/ui/table-action';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { TableSkeleton } from '@/components/ui/table-states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  promovidoFullName as fullName,
  promovidoPhone,
  promovidoSex,
} from '@/lib/promovido-mapper';
import { formatPhoneDisplay } from '@/lib/promovido-schema';
import type { PromovidoListItem } from '@/lib/promovidos-api';
import { Edit, Eye, Users } from 'lucide-react';

interface PromovidoTableProps {
  items: PromovidoListItem[];
  loading: boolean;
  onEdit: (item: PromovidoListItem) => void;
  onView: (item: PromovidoListItem) => void;
}

export function PromovidoTable({ items, loading, onEdit, onView }: PromovidoTableProps) {
  if (loading)
    return (
      <TableSkeleton
        headers={[
          'Nombre completo',
          'Clave de elector',
          'CURP',
          'Sección',
          'Líder',
          'Sexo',
          'Teléfono',
          'Vigencia',
          'Alta',
          'Acciones',
        ]}
      />
    );

  if (items.length === 0) {
    return (
      <Empty className="min-h-75">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Users />
          </EmptyMedia>
          <EmptyTitle>No hay promovidos para mostrar</EmptyTitle>
          <EmptyDescription>
            Agregá el primer promovido para comenzar o ajustá los filtros de búsqueda.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre completo</TableHead>
            <TableHead>Clave de elector</TableHead>
            <TableHead>CURP</TableHead>
            <TableHead>Sección</TableHead>
            <TableHead>Líder</TableHead>
            <TableHead>Sexo</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Vigencia</TableHead>
            <TableHead>Alta</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <button
                  type="button"
                  onClick={() => onView(item)}
                  aria-label={`Ver ${fullName(item)}`}
                  className="cursor-pointer text-left font-medium hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {fullName(item)}
                </button>
              </TableCell>
              <TableCell className="font-mono text-sm">{item.data.voterKey}</TableCell>
              <TableCell className="font-mono text-sm">{item.data.curp}</TableCell>
              <TableCell>{item.section.sectionCode}</TableCell>
              <TableCell>{item.leader.fullName}</TableCell>
              <TableCell>
                {promovidoSex(item) === 'H' ? 'Hombre' : promovidoSex(item) === 'M' ? 'Mujer' : '—'}
              </TableCell>
              <TableCell>
                {promovidoPhone(item) ? formatPhoneDisplay(promovidoPhone(item)!) : '—'}
              </TableCell>
              <TableCell>
                <TableStatusBadge active={item.isActive} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(item.createdAt).toLocaleDateString('es-MX')}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <TableAction onClick={() => onView(item)} label={`Ver ${fullName(item)}`}>
                    <Eye className="size-4" />
                  </TableAction>
                  <TableAction
                    tone="primary"
                    onClick={() => onEdit(item)}
                    label={`Editar ${fullName(item)}`}
                  >
                    <Edit className="h-4 w-4" />
                  </TableAction>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
