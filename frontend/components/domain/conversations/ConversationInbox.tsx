'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buildConversationsHref } from '@/lib/conversations-navigation';
import { FLOW_STATE_LABELS } from '@/lib/conversation-fsm';
import type { ConversationListItemDto } from '@/lib/conversations-api';
import Link from 'next/link';

interface ConversationInboxProps {
  items: ConversationListItemDto[];
  loading: boolean;
  hasNextPage: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

export function ConversationInbox({
  items,
  loading,
  hasNextPage,
  loadingMore,
  onLoadMore,
}: ConversationInboxProps) {
  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">
                Ciudadano
              </th>
              <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">
                Teléfono
              </th>
              <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">
                Estado
              </th>
              <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">Flujo</th>
              <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">
                Asignado
              </th>
              <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">Depto</th>
              <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">
                Actualizado
              </th>
              <th className="px-4 py-3 text-left text-xs uppercase text-muted-foreground">
                Acción
              </th>
            </tr>
          </thead>
          <tbody>
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  No hay conversaciones que coincidan con los filtros.
                </td>
              </tr>
            )}
            {loading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  Cargando…
                </td>
              </tr>
            )}
            {items.map((row) => {
              const flow = row.meta?.flowState;
              return (
                <tr key={row.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-medium">{row.citizen.name || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.citizen.phone}</td>
                  <td className="px-4 py-3">
                    <Badge variant={row.status === 'open' ? 'default' : 'secondary'}>
                      {row.status === 'open' ? 'En Gestión' : 'Caso Resuelto'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {flow ? (
                      <span className="text-xs font-semibold">{FLOW_STATE_LABELS[flow]}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {row.assignedUserId ? row.assignedUserId.slice(0, 8) + '…' : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {row.meta?.departmentSlug || row.assignedDept || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(row.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <Button asChild variant="outline" size="sm">
                      <Link href={buildConversationsHref({ conversationId: row.id })}>Abrir</Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasNextPage && (
        <div className="p-4 border-t flex justify-center">
          <Button variant="secondary" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Cargando…' : 'Cargar más'}
          </Button>
        </div>
      )}
    </div>
  );
}
