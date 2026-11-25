'use client';

import { MessageBubble } from '@/components/shared/messaging/MessageBubble';
import { Button } from '@/components/ui/button';
import { LoadingMessages } from '@/components/ui/loading-messages';
import {
  type ConversationTicketApi,
  type ConversationTicketPriorityApi,
  type ConversationTicketStatusApi,
  type MessageApi,
  messagingApi,
} from '@/lib/shared/messaging-api';
import { cn } from '@/lib/shared/utils';
import { CalendarClock, ChevronLeft, FileText, Loader2, MessagesSquare } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface TicketHistoryPanelProps {
  conversationId: string;
  currentUserId?: string;
  onClose?: () => void;
}

const STATUS_CONFIG: Record<ConversationTicketStatusApi, { label: string; className: string }> = {
  OPEN: { label: 'Abierto', className: 'bg-emerald-500/10 text-emerald-700' },
  IN_PROGRESS: { label: 'En progreso', className: 'bg-sky-500/10 text-sky-700' },
  RESOLVED: { label: 'Resuelto', className: 'bg-amber-500/10 text-amber-700' },
  CLOSED: { label: 'Cerrado', className: 'bg-muted text-muted-foreground' },
};

const PRIORITY_LABEL: Record<ConversationTicketPriorityApi, string> = {
  LOW: 'Baja',
  MEDIUM: 'Media',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

function formatTicketDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Historial por ticket de una conversación (aislamiento de mensajes por ticket).
 * Lista los tickets de la conversación; al seleccionar uno, muestra SOLO los
 * mensajes asociados a ese ticket.
 */
export function TicketHistoryPanel({
  conversationId,
  currentUserId,
  onClose,
}: TicketHistoryPanelProps) {
  const [tickets, setTickets] = useState<ConversationTicketApi[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<ConversationTicketApi | null>(null);
  const [messages, setMessages] = useState<MessageApi[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setTicketsLoading(true);
    setTicketsError(false);
    setSelectedTicket(null);
    setMessages([]);

    messagingApi
      .listConversationTickets(conversationId)
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setTicketsError(true);
          return;
        }
        setTickets(res.data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setTicketsError(true);
      })
      .finally(() => {
        if (!cancelled) setTicketsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!selectedTicket) return;
    let cancelled = false;
    setMessagesLoading(true);
    setMessages([]);

    messagingApi
      .listTicketMessages(selectedTicket.id, { limit: 200 })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setMessages([]);
          return;
        }
        setMessages(res.data.items ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTicket]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedTicket?.id]);

  return (
    <aside
      className="flex flex-col w-80 shrink-0 border-l border-border bg-card min-h-0"
      aria-label="Historial por ticket"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          {selectedTicket && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setSelectedTicket(null)}
              aria-label="Volver a la lista de tickets"
            >
              <ChevronLeft className="size-4" />
            </Button>
          )}
          <FileText className="size-4 text-muted-foreground shrink-0" />
          <h3 className="text-sm font-semibold truncate">
            {selectedTicket ? 'Mensajes del ticket' : 'Detalle por ticket'}
          </h3>
        </div>
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onClose}
            aria-label="Cerrar historial por ticket"
          >
            <Loader2 className="size-4 -rotate-45" />
          </Button>
        )}
      </div>

      {ticketsLoading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-primary" aria-label="Cargando tickets" />
        </div>
      )}

      {!ticketsLoading && ticketsError && (
        <div className="flex-1 flex items-center justify-center px-4 text-center text-sm text-muted-foreground">
          No se pudo cargar el historial de tickets.
        </div>
      )}

      {!ticketsLoading && !ticketsError && selectedTicket && (
        <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 font-medium',
                STATUS_CONFIG[selectedTicket.status].className,
              )}
            >
              {STATUS_CONFIG[selectedTicket.status].label}
            </span>
            <span>Prioridad {PRIORITY_LABEL[selectedTicket.priority]}</span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3" />
              {formatTicketDate(selectedTicket.createdAt)}
            </span>
          </div>
          {messagesLoading && <LoadingMessages />}
          {!messagesLoading && messages.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">
              Este ticket no tiene mensajes asociados.
            </p>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} currentUserId={currentUserId} />
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {!ticketsLoading && !ticketsError && !selectedTicket && (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto px-2 py-2">
          {tickets.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8 px-4">
              No hay tickets registrados para esta conversación.
            </p>
          )}
          {tickets.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => setSelectedTicket(ticket)}
              className="flex items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted/60 transition-colors"
            >
              <MessagesSquare className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">
                  {ticket.title?.trim() || `Ticket #${ticket.id.slice(0, 8)}`}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span>{formatTicketDate(ticket.createdAt)}</span>
                  <span>·</span>
                  <span>{ticket.messageCount} msgs</span>
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                  STATUS_CONFIG[ticket.status].className,
                )}
              >
                {STATUS_CONFIG[ticket.status].label}
              </span>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
