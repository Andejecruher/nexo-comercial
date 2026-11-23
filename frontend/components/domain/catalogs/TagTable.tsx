/**
 * TagTable — Tabla responsive de etiquetas con acciones
 *
 * Desktop: tabla tradicional. Mobile: cards con Sheet.
 */

'use client';

import { Badge } from '@/components/ui/badge';
import { TableAction } from '@/components/ui/table-action';
import { TableEmptyState, TableSkeleton } from '@/components/ui/table-states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useIsMobile } from '@/hooks/use-mobile';
import type { Tag } from '@/lib/catalog-api';
import { Edit, Tag as TagIcon, Trash2 } from 'lucide-react';

interface TagTableProps {
  tags: Tag[];
  loading: boolean;
  onEdit: (tag: Tag) => void;
  onDelete: (tag: Tag) => void;
}

export function TagTable({ tags, loading, onEdit, onDelete }: TagTableProps) {
  const isMobile = useIsMobile();

  // ─── Loading State ─────────────────────────────────────────────────────────
  if (loading) return <TableSkeleton headers={['Nombre', 'Color', 'Descripción', 'Acciones']} />;

  if (tags.length === 0)
    return (
      <TableEmptyState
        icon={TagIcon}
        title="No se encontraron etiquetas"
        description="Ajustá los filtros para ver etiquetas."
      />
    );

  // ─── Color Badge ───────────────────────────────────────────────────────────
  const ColorBadge = ({ color }: { color?: string }) => {
    if (!color) return <span className="text-muted-foreground text-xs">—</span>;

    return (
      <Badge variant="secondary" className="gap-1.5" style={{ borderColor: color, color }}>
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        {color}
      </Badge>
    );
  };

  // ─── Mobile: Cards ─────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="space-y-3">
        {tags.map((tag) => (
          <div key={tag.id} className="bg-card border rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm truncate">{tag.name}</h3>
                {tag.color && (
                  <div className="mt-1.5">
                    <ColorBadge color={tag.color} />
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <TableAction
                  touch
                  tone="primary"
                  onClick={() => onEdit(tag)}
                  label={`Editar ${tag.name}`}
                >
                  <Edit className="w-4 h-4" />
                </TableAction>
                <TableAction
                  touch
                  tone="danger"
                  onClick={() => onDelete(tag)}
                  label={`Eliminar ${tag.name}`}
                >
                  <Trash2 className="size-4" />
                </TableAction>
              </div>
            </div>
            {tag.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">{tag.description}</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  // ─── Desktop: Table ────────────────────────────────────────────────────────
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[30%]">Nombre</TableHead>
            <TableHead className="w-[20%]">Color</TableHead>
            <TableHead className="w-[40%]">Descripción</TableHead>
            <TableHead className="w-[10%] text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tags.map((tag) => (
            <TableRow key={tag.id}>
              <TableCell className="font-medium">{tag.name}</TableCell>
              <TableCell>
                <ColorBadge color={tag.color} />
              </TableCell>
              <TableCell>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {tag.description || '—'}
                </p>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <TableAction
                    tone="primary"
                    onClick={() => onEdit(tag)}
                    label={`Editar ${tag.name}`}
                  >
                    <Edit className="w-4 h-4" />
                  </TableAction>
                  <TableAction
                    tone="danger"
                    onClick={() => onDelete(tag)}
                    label={`Eliminar ${tag.name}`}
                  >
                    <Trash2 className="size-4" />
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
