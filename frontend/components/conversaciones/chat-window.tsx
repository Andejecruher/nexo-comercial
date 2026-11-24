'use client';

import {
  TransferButton,
  type TransferDestinationType,
} from '@/components/conversaciones/TransferButton';
import { BotIcon } from '@/components/shared/messaging/bot-icon';
import { CustomerWindowBanner } from '@/components/conversaciones/CustomerWindowBanner';
import { MessageComposer } from '@/components/conversaciones/MessageComposer';
import { MessageHistory, type HistoryProps } from '@/components/shared/messaging/MessageHistory';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { LoadingMessages } from '@/components/ui/loading-messages';
import { TypingIndicator } from '@/components/ui/typing-indicator';
import type { PreparedAttachmentPayload } from '@/hooks/conversaciones/useConversationMessages';
import { useCustomerWindow } from '@/hooks/conversaciones/useCustomerWindow';
import type { PanelUserDto } from '@/lib/shared/admin-users-api';
import type { Department } from '@/lib/shared/catalog-api';
import type { InboxConversation, InboxStatus, MessageApi } from '@/lib/shared/messaging-api';
import { formatPhoneDisplay } from '@/lib/shared/phone-utils';
import { cn } from '@/lib/shared/utils';
import { ArrowLeft, Loader2, Send } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { StartConversationDialog } from '@/components/conversaciones/start-conversation-dialog';

interface ChatWindowProps extends Pick<
  HistoryProps,
  'hasOlder' | 'loadingOlder' | 'loadOlder' | 'historyError'
> {
  chat: InboxConversation | null;
  apiMessages: MessageApi[];
  messagesLoading: boolean;
  sending: boolean;
  closing?: boolean;
  botTyping?: boolean;
  socketConnected?: boolean;
  /** id del usuario autenticado — para etiquetar "Tú" los mensajes propios */
  currentUserId?: string;
  /** datos para el menú de transferencia (si onTransfer está presente) */
  departments?: Department[];
  panelUsers?: PanelUserDto[];
  usersLoading?: boolean;
  transferRunning?: boolean;
  canTransfer?: boolean;
  onSend: (
    text: string,
    attachments: PreparedAttachmentPayload[],
  ) => Promise<void | boolean | { ok?: boolean }>;
  onSendAudio?: (file: File, durationSeconds: number) => Promise<void | boolean | { ok?: boolean }>;
  onCloseConversation?: () => Promise<boolean>;
  onTransfer?: (type: TransferDestinationType, targetId: string) => Promise<boolean>;
  onBack?: () => void;
  profileAction?: ReactNode;
}

const INBOX_STATUS_CONFIG: Record<InboxStatus, { label: string; color: string; bg: string }> = {
  active: { label: 'Activa', color: 'text-primary', bg: 'bg-primary/10' },
  inactive: { label: 'Inactiva', color: 'text-muted-foreground', bg: 'bg-muted' },
};

export function ChatWindow({
  chat,
  apiMessages,
  messagesLoading,
  sending,
  closing = false,
  botTyping = false,
  socketConnected = true,
  currentUserId,
  departments = [],
  panelUsers = [],
  usersLoading = false,
  transferRunning = false,
  canTransfer = false,
  onSend,
  onSendAudio,
  onCloseConversation,
  onTransfer,
  onBack,
  profileAction,
  hasOlder,
  loadingOlder,
  loadOlder,
  historyError,
}: ChatWindowProps) {
  const windowState = useCustomerWindow(chat?.id, apiMessages);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!chat) {
    return (
      <div className="min-h-0 min-w-0 flex-1 flex flex-col items-center justify-center bg-muted/30 text-muted-foreground text-center p-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mb-4">
          <Send className="w-7 h-7 text-muted-foreground/40" />
        </div>
        <p className="font-medium text-foreground/60">Selecciona una conversación</p>
        <p className="text-sm mt-1">Elige un chat de la lista para comenzar</p>
      </div>
    );
  }

  const cfg = INBOX_STATUS_CONFIG[chat.inboxStatus];

  const handleConfirmClose = async () => {
    if (!onCloseConversation || closing) return;
    const ok = await onCloseConversation();
    if (ok) setConfirmOpen(false);
  };

  const assignee = (chat: InboxConversation) => {
    if (chat.assignedUserName) {
      return chat.assignedUserName;
    }

    if (chat.departmentSlug) {
      return departments.find((department) => department.slug === chat.departmentSlug)?.name;
    }

    if (chat.botAgent) {
      return chat.botAgent.name;
    }
    return 'Sin asignar';
  };

  return (
    <div className="h-full min-w-0 flex-1 flex flex-col min-h-0 overflow-hidden bg-background">
      {/* Chat header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-3.5 md:px-5 border-b border-border bg-card shadow-sm">
        <div className="flex flex-1 items-center gap-3 min-w-0">
          {onBack && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onBack}
              aria-label="Volver a conversaciones"
              className="shrink-0 md:hidden"
            >
              <ArrowLeft className="size-5" aria-hidden />
            </Button>
          )}
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold shrink-0">
            {chat.citizen.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground text-sm truncate">
                {chat.citizen.name}
              </span>
              <span
                className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0',
                  cfg.bg,
                  cfg.color,
                )}
              >
                {cfg.label}
              </span>
              {chat.botAgent && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                  <BotIcon className="size-2.5" />
                  {assignee(chat)}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {chat.citizen.colonia} ·{' '}
              {formatPhoneDisplay(chat.citizen.phone) || chat.citizen.phone}
            </p>
          </div>
        </div>
        {profileAction}
        <div className="flex w-full flex-wrap items-center justify-end gap-2 shrink-0 empty:hidden xl:w-auto">
          {canTransfer && onTransfer && (
            <TransferButton
              departments={departments}
              panelUsers={panelUsers}
              usersLoading={usersLoading}
              running={transferRunning}
              onTransfer={onTransfer}
            />
          )}
          {chat.canClose && onCloseConversation ? (
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={closing}
                  aria-busy={closing}
                >
                  {closing ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Cerrando…
                    </>
                  ) : (
                    'Cerrar Conversación'
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cerrar esta conversación</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se cerrará el ticket activo, se liberará al agente o departamento asignado y el
                    bot atenderá la próxima interacción del ciudadano.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={closing}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={closing}
                    onClick={(event) => {
                      event.preventDefault();
                      void handleConfirmClose();
                    }}
                  >
                    {closing ? 'Cerrando…' : 'Cerrar Conversación'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>

      <MessageHistory
        messages={apiMessages}
        identity={chat.id}
        currentUserId={currentUserId}
        hasOlder={hasOlder}
        loadingOlder={loadingOlder}
        loadOlder={loadOlder}
        historyError={historyError}
      >
        {messagesLoading && apiMessages.length === 0 && <LoadingMessages />}
        {botTyping && <TypingIndicator />}
      </MessageHistory>

      {/* Composer */}
      <div className="shrink-0 px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-5 border-t border-border bg-card">
        {!socketConnected && (
          <p className="text-xs text-amber-700 mb-2" role="status">
            Sin conexión en tiempo real. Reconectando…
          </p>
        )}
        {!windowState.isOpen && (
          <CustomerWindowBanner {...windowState} onStart={() => setTemplateOpen(true)} />
        )}
        <StartConversationDialog
          open={templateOpen}
          onOpenChange={setTemplateOpen}
          initialChat={chat}
          onSelect={() => setTemplateOpen(false)}
        />
        <MessageComposer
          lineId={chat.communicationLineId}
          onSend={onSend}
          onSendAudio={onSendAudio}
          sending={sending}
          disabled={
            !windowState.isOpen || messagesLoading || !chat.canClose || closing || !socketConnected
          }
        />
      </div>
    </div>
  );
}
