'use client';
import { memo } from 'react';
import { Eye, Trash2, BarChart3, Pencil, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TableAction } from '@/components/ui/table-action';
import { TableEmptyState } from '@/components/ui/table-states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/shared/utils';
import { canEditTemplate, type MessageTemplate } from '@/lib/shared/templates-api';
export const STATUS_LABELS: Record<string, string> = {
  APPROVED: 'Aprobada',
  PENDING: 'Pendiente',
  REJECTED: 'Rechazada',
  PAUSED: 'Pausada',
  DISABLED: 'Deshabilitada',
  IN_APPEAL: 'En apelación',
  DELETED: 'Eliminada',
  PENDING_DELETION: 'Eliminación pendiente',
};
// Estado → colores del Design System (success / warning / error + neutral).
const statusStyles: Record<string, string> = {
  APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
  REJECTED: 'border-red-200 bg-red-50 text-red-700',
};
const statusClass = (status: string) =>
  statusStyles[status] ?? 'border-slate-200 bg-slate-100 text-slate-600';
export const CATEGORY_LABELS: Record<string, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilidad',
  AUTHENTICATION: 'Autenticación',
};
const languages: Record<string, string> = {
  es: 'Español',
  es_MX: 'Español (México)',
  en_US: 'Inglés',
  pt_BR: 'Portugués',
};
const quality: Record<string, string> = {
  GREEN: 'Alta',
  YELLOW: 'Media',
  RED: 'Baja',
  UNKNOWN: 'Pendiente',
};
const date = (value?: string) =>
  value
    ? new Intl.DateTimeFormat('es-MX', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Mexico_City',
      }).format(new Date(value))
    : '—';
export type TemplateAction = 'view' | 'edit' | 'delete' | 'analytics';
interface RowProps {
  template: MessageTemplate;
  canUpdate: boolean;
  canDelete: boolean;
  onAction: (action: TemplateAction, template: MessageTemplate) => void;
}
function TemplateActions({
  template: t,
  canUpdate,
  canDelete,
  onAction,
  sizeClass,
}: RowProps & { sizeClass?: string }) {
  const editable = canEditTemplate(t);
  return (
    <div className={cn('flex items-center gap-1', !sizeClass && 'justify-end')}>
      <TableAction
        className={sizeClass}
        label={`Ver ${t.name}`}
        onClick={() => onAction('view', t)}
      >
        <Eye className="size-4" />
      </TableAction>
      <TableAction
        className={sizeClass}
        label={`Estadísticas de ${t.name}`}
        onClick={() => onAction('analytics', t)}
      >
        <BarChart3 className="size-4" />
      </TableAction>
      {canUpdate && (
        <TableAction
          className={sizeClass}
          tone="primary"
          disabled={!editable}
          title={!editable ? 'Este formato requiere edición en Meta' : 'Editar'}
          label={`Editar ${t.name}`}
          onClick={() => onAction('edit', t)}
        >
          <Pencil className="size-4" />
        </TableAction>
      )}
      {canDelete && (
        <TableAction
          className={sizeClass}
          tone="danger"
          label={`Eliminar ${t.name}`}
          onClick={() => onAction('delete', t)}
        >
          <Trash2 className="size-4" />
        </TableAction>
      )}
    </div>
  );
}
export const TemplateRow = memo(function TemplateRow({
  template: t,
  canUpdate,
  canDelete,
  onAction,
}: RowProps) {
  return (
    <TableRow>
      <TableCell className="font-medium">{t.name}</TableCell>
      <TableCell className="text-muted-foreground">{languages[t.language] ?? t.language}</TableCell>
      <TableCell>
        <Badge variant="outline">{CATEGORY_LABELS[t.category] ?? t.category}</Badge>
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          title={t.rejected_reason}
          className={cn('whitespace-nowrap rounded-md', statusClass(t.status))}
        >
          {t.status === 'APPROVED' && (
            <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
          )}
          {STATUS_LABELS[t.status] ?? t.status}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {quality[t.quality_score?.score ?? 'UNKNOWN'] ?? t.quality_score?.score}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">{date(t.createdAt)}</TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">{date(t.updatedAt)}</TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <TemplateActions
          template={t}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onAction={onAction}
        />
      </TableCell>
    </TableRow>
  );
});
export const TemplateCard = memo(function TemplateCard({
  template: t,
  canUpdate,
  canDelete,
  onAction,
}: RowProps) {
  return (
    <article className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{t.name}</p>
          <p className="text-xs text-muted-foreground">{languages[t.language] ?? t.language}</p>
        </div>
        <Badge
          variant="outline"
          title={t.rejected_reason}
          className={cn('shrink-0 rounded-md', statusClass(t.status))}
        >
          {t.status === 'APPROVED' && (
            <span aria-hidden="true" className="size-1.5 rounded-full bg-emerald-500" />
          )}
          {STATUS_LABELS[t.status] ?? t.status}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge variant="outline">{CATEGORY_LABELS[t.category] ?? t.category}</Badge>
        <span className="text-xs text-muted-foreground">
          Calidad: {quality[t.quality_score?.score ?? 'UNKNOWN'] ?? t.quality_score?.score ?? '—'}
        </span>
      </div>
      <div className="border-t pt-3">
        <TemplateActions
          template={t}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onAction={onAction}
          sizeClass="size-11"
        />
      </div>
    </article>
  );
});
export function TemplateTable({
  templates,
  canUpdate,
  canDelete,
  onAction,
}: Omit<RowProps, 'template'> & { templates: MessageTemplate[] }) {
  if (templates.length === 0) {
    return <TableEmptyState icon={FileText} title="No se encontraron plantillas" />;
  }
  return (
    <>
      {/* Mobile / small tablets: stacked cards with the most relevant data. */}
      <div className="space-y-3 md:hidden">
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onAction={onAction}
            canUpdate={canUpdate}
            canDelete={canDelete}
          />
        ))}
      </div>
      {/* Desktop: full table with horizontal overflow fallback. */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {[
                'Nombre',
                'Idioma',
                'Categoría',
                'Estado',
                'Calidad',
                'Fecha de creación',
                'Última actualización',
                'Acciones',
              ].map((title) => (
                <TableHead
                  key={title}
                  scope="col"
                  className={title === 'Acciones' ? 'text-right' : undefined}
                >
                  {title}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                onAction={onAction}
                canUpdate={canUpdate}
                canDelete={canDelete}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
