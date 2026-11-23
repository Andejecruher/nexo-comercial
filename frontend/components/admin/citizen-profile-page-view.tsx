'use client';

import { KPIGrid, type KPIItem } from '@/components/dashboard/KPIGrid';
import { CitizenProfile } from '@/components/domain/citizens/CitizenProfile';
import { CitizenPromovidoPanel } from '@/components/domain/citizens/CitizenPromovidoPanel';
import { CitizenTagsPanel } from '@/components/domain/citizens/CitizenTagsPanel';
import { CitizenTimelineSummary } from '@/components/domain/citizens/CitizenTimelineSummary';
import { TICKET_STATUS_CONFIG } from '@/components/tickets/TicketStatusBadge';
import { TicketTable } from '@/components/tickets/TicketTable';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCitizenTickets } from '@/hooks/tickets/useCitizenTickets';
import { useCitizenProfile } from '@/hooks/useCitizenProfile';
import { useCitizenTags } from '@/hooks/useCitizenTags';
import { usePermissions } from '@/hooks/usePermissions';
import { useTags } from '@/hooks/useTags';
import { adminUsersApi, type PanelUserDto } from '@/lib/admin-users-api';
import { countTicketsByStatus, TICKET_STATUSES, type TicketStatus } from '@/lib/tickets-api';
import { CheckCircle2, Clock, FileText, Inbox, Send } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

const STATUS_KPI_STYLE: Record<TicketStatus, Pick<KPIItem, 'icon' | 'tone'>> = {
  OPEN: { icon: Inbox, tone: 'neutral' },
  IN_PROGRESS: { icon: Clock, tone: 'warning' },
  RESOLVED: { icon: Send, tone: 'positive' },
  CLOSED: { icon: CheckCircle2, tone: 'positive' },
};

interface CitizenProfilePageViewProps {
  citizenId: string;
}

export function CitizenProfilePageView({ citizenId }: CitizenProfilePageViewProps) {
  const { profile, loading, error, refresh } = useCitizenProfile(citizenId);
  const { tags } = useTags({ pageSize: 100 });
  const citizenTags = useCitizenTags();
  const tickets = useCitizenTickets(citizenId);

  const { roles } = usePermissions();
  const isSupervisor = useMemo(
    () => roles.some((r) => r === 'COORDINADOR' || r === 'SUPER_ADMIN'),
    [roles],
  );

  const [panelUsers, setPanelUsers] = useState<PanelUserDto[]>([]);

  useEffect(() => {
    if (!isSupervisor) return;
    void (async () => {
      const res = await adminUsersApi.list();
      if (res.ok) setPanelUsers(res.data.users);
    })();
  }, [isSupervisor]);

  const agentsMap = useMemo(() => {
    const m = new Map<string, PanelUserDto>();
    panelUsers.forEach((u) => m.set(u.id, u));
    return m;
  }, [panelUsers]);

  const kpiItems = useMemo<KPIItem[]>(() => {
    const counts = countTicketsByStatus(tickets.items);
    // El total viene del conteo en base de datos; el desglose por estado se
    // calcula sobre las páginas ya cargadas.
    const total = profile?.conversationSummary.totalConversations ?? tickets.items.length;

    return [
      { label: 'Total Tickets', value: total, icon: FileText, tone: 'neutral' },
      ...TICKET_STATUSES.map((status) => ({
        label: TICKET_STATUS_CONFIG[status].label,
        value: counts[status],
        ...STATUS_KPI_STYLE[status],
      })),
    ];
  }, [tickets.items, profile]);

  if (loading && !profile) {
    return (
      <div className="h-full overflow-y-auto p-4 md:p-6 space-y-5">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-destructive">{error}</p>
        <Button onClick={refresh}>Reintentar</Button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-muted-foreground">No se encontró el ciudadano solicitado.</p>
        <Button asChild variant="outline">
          <Link href="/admin/ciudadanos">Volver al CRM</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline">
          <Link href="/admin/ciudadanos">Volver al CRM</Link>
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            void refresh();
            void tickets.refresh();
          }}
        >
          Actualizar perfil
        </Button>
      </div>

      <CitizenProfile citizen={profile.citizen} />

      <KPIGrid items={kpiItems} loading={tickets.loading && tickets.items.length === 0} />

      <CitizenPromovidoPanel promovido={profile.promovido} />

      <section className="space-y-3">
        <h2 className="text-base font-black text-foreground">Historial de Tickets</h2>
        <TicketTable
          tickets={tickets.items}
          loading={tickets.loading}
          error={tickets.error}
          agentsMap={agentsMap}
          hideCitizenColumn
          emptyMessage="Este ciudadano todavía no tiene tickets registrados."
          onRetry={() => void tickets.refresh()}
          footer={
            tickets.hasNextPage ? (
              <div className="flex justify-center border-t p-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={tickets.loadMore}
                  disabled={tickets.loadingMore}
                  className="min-h-11 text-muted-foreground"
                >
                  {tickets.loadingMore ? 'Cargando más…' : 'Cargar más tickets'}
                </Button>
              </div>
            ) : null
          }
        />
      </section>

      <CitizenTagsPanel
        tags={profile.tags}
        availableTags={tags}
        loading={citizenTags.assigning || citizenTags.removing}
        onAssignTag={async (tagId) => {
          await citizenTags.assignTag(profile.citizen.id, tagId);
          await refresh();
        }}
        onRemoveTag={async (tagId) => {
          await citizenTags.removeTag(profile.citizen.id, tagId);
          await refresh();
        }}
      />

      <CitizenTimelineSummary
        conversationSummary={profile.conversationSummary}
        participationHistory={profile.participationHistory}
      />
    </div>
  );
}
