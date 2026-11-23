'use client';

/**
 * TicketDetailLayout — Layout tipo inbox: chat a la izquierda, sidebar a la derecha.
 *
 * Orquesta los hooks y pasa los datos procesados a los componentes presentacionales.
 */

import { TicketChat } from '@/components/tickets/TicketChat';
import { TicketSidebar } from '@/components/tickets/TicketSidebar';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useAssignTicket } from '@/hooks/tickets/useAssignTicket';
import { useTicketDetail } from '@/hooks/tickets/useTicketDetail';
import { useAuth } from '@/hooks/useAuth';
import { useDepartments } from '@/hooks/useDepartments';
import { usePermissions } from '@/hooks/usePermissions';
import { adminUsersApi, type PanelUserDto } from '@/lib/admin-users-api';
import { getConversationActionFlags } from '@/lib/conversation-ui-actions';
import { SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface TicketDetailLayoutProps {
  ticketId: string;
}

export function TicketDetailLayout({ ticketId }: TicketDetailLayoutProps) {
  const { user } = useAuth();
  const { roles } = usePermissions();

  const {
    hasOlder,
    loadingOlder,
    loadOlder,
    historyError,
    ticket,
    messages,
    loading,
    messagesLoading,
    error,
    refresh,
    botTyping,
    aiDraftText,
  } = useTicketDetail(ticketId);

  const isSupervisor = useMemo(
    () => roles.some((r) => r === 'COORDINADOR' || r === 'SUPER_ADMIN'),
    [roles],
  );

  const deptState = useDepartments({ pageSize: 100 });

  const [panelUsers, setPanelUsers] = useState<PanelUserDto[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Release the modal focus/scroll lock when the desktop sidebar becomes visible.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1280px)');
    const closeOnDesktop = () => {
      if (desktop.matches) setDetailsOpen(false);
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  const refreshAll = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const actions = useAssignTicket(ticket?.conversationId ?? '', refreshAll);

  useEffect(() => {
    if (!isSupervisor) {
      setPanelUsers([]);
      return;
    }
    let cancelled = false;
    setUsersLoading(true);
    void (async () => {
      const res = await adminUsersApi.list();
      if (cancelled) return;
      setUsersLoading(false);
      if (res.ok) setPanelUsers(res.data.users);
    })();
    return () => {
      cancelled = true;
    };
  }, [isSupervisor]);

  const flags = useMemo(() => {
    if (!ticket) {
      return {
        canAssignSelf: false,
        canAssignOther: false,
        canTransfer: false,
        canHandover: false,
        canClose: false,
        canReopen: false,
        canSendMessage: false,
      };
    }
    return getConversationActionFlags({
      flowState: ticket.flowState,
      status: ticket.conversationStatus,
      assignedUserId: ticket.assignedUserId,
      currentUserId: user?.id,
      isSupervisor,
    });
  }, [ticket, user?.id, isSupervisor]);

  if (error && !ticket) {
    return (
      <div className="h-full overflow-y-auto p-4 space-y-3 sm:p-6">
        <p className="text-destructive text-sm">{error}</p>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11 cursor-pointer" onClick={() => void refresh()}>
            Reintentar
          </Button>
          <Button variant="outline" className="min-h-11 cursor-pointer" asChild>
            <Link href="/admin/tickets">← Volver a tickets</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!ticket && loading) {
    return <div className="p-6 text-muted-foreground text-sm animate-pulse">Cargando ticket…</div>;
  }

  if (!ticket) return null;

  const sidebar = (
    <TicketSidebar
      ticket={ticket}
      flags={flags}
      isSupervisor={isSupervisor}
      departments={deptState.departments}
      panelUsers={panelUsers}
      usersLoading={usersLoading}
      running={actions.running}
      actions={actions}
    />
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-4 xl:p-6">
        {/* Header */}
        <header className="max-h-[40%] shrink-0 space-y-2 overflow-y-auto [overflow-wrap:anywhere]">
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" className="min-h-11 cursor-pointer" asChild>
              <Link href="/admin/tickets">← Tickets</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 cursor-pointer"
              onClick={() => void refreshAll()}
            >
              Actualizar
            </Button>
          </div>
          <div className="min-w-0 space-y-1">
            <h1 className="text-base font-black text-foreground sm:text-xl">
              {ticket.citizenName}{' '}
              <span className="inline-block text-muted-foreground font-mono text-sm font-normal">
                {ticket.citizenPhone}
              </span>
            </h1>
            <p className="text-xs text-muted-foreground font-mono">Folio: {ticket.folio}</p>
          </div>
        </header>

        {/* Main layout */}
        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          {/* Chat — 2/3 */}
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <TicketChat
              identity={ticketId}
              hasOlder={hasOlder}
              loadingOlder={loadingOlder}
              loadOlder={loadOlder}
              historyError={historyError}
              messages={messages}
              loading={loading}
              messagesLoading={messagesLoading}
              botTyping={botTyping}
              aiDraftText={aiDraftText}
            />
          </div>

          {/* Sidebar — 1/3 */}
          <aside
            aria-label="Detalles y acciones del ticket"
            className="hidden min-h-0 min-w-0 overflow-y-auto xl:block"
          >
            {sidebar}
          </aside>
        </div>
      </div>
      {/* In normal flex flow so the bar never covers the message history. */}
      <div className="shrink-0 border-t bg-card px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] xl:hidden">
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="min-h-11 w-full cursor-pointer gap-2">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Detalles y acciones
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[90dvh] gap-0 rounded-t-2xl [&>button]:top-2 [&>button]:right-2 [&>button]:flex [&>button]:size-11 [&>button]:cursor-pointer [&>button]:items-center [&>button]:justify-center [&>button>svg]:text-foreground"
          >
            <SheetHeader className="shrink-0 border-b pr-16 text-left">
              <SheetTitle>Detalles y acciones</SheetTitle>
              <SheetDescription>Consulta el ticket y gestiona su atención.</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {sidebar}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
