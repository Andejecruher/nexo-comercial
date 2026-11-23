'use client';

import type { TransferDestinationType } from '@/components/domain/conversations/TransferButton';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useAdminInboxConversations } from '@/hooks/useAdminInboxConversations';
import { useAuth } from '@/hooks/useAuth';
import {
  useConversationMessages,
  type PreparedAttachmentPayload,
} from '@/hooks/useConversationMessages';
import { useDepartments } from '@/hooks/useDepartments';
import { usePermissions } from '@/hooks/usePermissions';
import { adminUsersApi, type PanelUserDto } from '@/lib/admin-users-api';
import { conversationsApi, type TransferTarget } from '@/lib/conversations-api';
import type { InboxConversation } from '@/lib/messaging-api';
import { User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChatList } from './chat-list';
import { ChatWindow } from './chat-window';
import { CitizenProfile } from './citizen-profile';

export function InboxView() {
  const { user } = useAuth();
  const { roles } = usePermissions();
  const deptState = useDepartments({ pageSize: 100 });
  const {
    conversations,
    loading: listLoading,
    filters,
    searchInput,
    setSearchInput,
    applyFilters,
    upsertConversation,
    closeConversation,
    markConversationRead,
    setSelectedConversationId,
    requestedConversationId,
    clearRequestedConversation,
    closingId,
    refresh: refreshList,
  } = useAdminInboxConversations();
  const [selectedChat, setSelectedChat] = useState<InboxConversation | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [hasProfileColumn, setHasProfileColumn] = useState(false);

  useEffect(() => {
    // Reserve the third column for screens with room for the navigation sidebar too.
    const media = window.matchMedia('(min-width: 1280px)');
    const syncProfileLayout = () => {
      setHasProfileColumn(media.matches);
      if (media.matches) setIsProfileOpen(false);
    };
    syncProfileLayout();
    media.addEventListener('change', syncProfileLayout);
    return () => media.removeEventListener('change', syncProfileLayout);
  }, []);

  const isSupervisor = useMemo(
    () => roles.some((r) => r === 'COORDINADOR' || r === 'SUPER_ADMIN'),
    [roles],
  );

  const [panelUsers, setPanelUsers] = useState<PanelUserDto[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [transferRunning, setTransferRunning] = useState(false);

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
      if (res.ok) {
        setPanelUsers(res.data.users);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSupervisor]);

  const activeChat = useMemo(() => {
    if (!selectedChat) return null;
    return conversations.find((item) => item.id === selectedChat.id) ?? selectedChat;
  }, [conversations, selectedChat]);

  const {
    messages: apiMessages,
    hasOlder,
    loadingOlder,
    loadOlder,
    historyError,
    loading: messagesLoading,
    sending,
    botTyping,
    socketConnected,
    sendMessageSafe,
    sendAudioSafe,
  } = useConversationMessages(activeChat?.id);

  useEffect(() => {
    if (!selectedChat) {
      setSelectedConversationId(undefined);
      return;
    }
    const current = conversations.find((item) => item.id === selectedChat.id);
    if (!current) {
      setSelectedChat(null);
      setSelectedConversationId(undefined);
      setIsProfileOpen(false);
    }
  }, [conversations, selectedChat, setSelectedConversationId]);

  useEffect(() => {
    if (!activeChat?.id || activeChat.unread === 0) return;
    void markConversationRead(activeChat.id);
  }, [activeChat?.id, activeChat?.unread, markConversationRead]);

  const handleSend = useCallback(
    async (text: string, attachments: PreparedAttachmentPayload[]) =>
      sendMessageSafe(text, attachments),
    [sendMessageSafe],
  );

  const handleSendAudio = useCallback(
    async (file: File, durationSeconds: number) => sendAudioSafe(file, durationSeconds),
    [sendAudioSafe],
  );

  const handleSelectChat = useCallback(
    (chat: InboxConversation) => {
      setSelectedConversationId(chat.id);
      upsertConversation(chat);
      setSelectedChat(chat);
      setIsProfileOpen(false);
    },
    [setSelectedConversationId, upsertConversation],
  );

  // Abre la conversación pedida por query param (`?conversation=<id>`) una vez
  // que el listado ya la contiene (el hook la inserta si no estaba).
  useEffect(() => {
    if (!requestedConversationId) return;
    const target = conversations.find((item) => item.id === requestedConversationId);
    if (!target) return;
    handleSelectChat(target);
    clearRequestedConversation();
  }, [conversations, requestedConversationId, handleSelectChat, clearRequestedConversation]);

  const handleCloseConversation = useCallback(async () => {
    if (!activeChat) return false;
    return closeConversation(activeChat.id);
  }, [activeChat, closeConversation]);

  const toTransferTarget = useCallback(
    (type: TransferDestinationType, targetId: string): TransferTarget => {
      switch (type) {
        case 'department':
          return { type: 'department', departmentSlug: targetId };
        case 'agent':
          return { type: 'agent', toUserId: targetId };
        case 'ai':
          return { type: 'ai' };
      }
    },
    [],
  );

  const handleTransfer = useCallback(
    async (type: TransferDestinationType, targetId: string): Promise<boolean> => {
      if (!activeChat) return false;
      if (transferRunning) return false;
      setTransferRunning(true);
      try {
        const result = await conversationsApi.transferChat(
          activeChat.id,
          toTransferTarget(type, targetId),
        );
        if (!result.ok) {
          toast.error('No se pudo transferir la conversación', {
            description: result.message,
          });
          return false;
        }
        toast.success('Conversación transferida');
        await refreshList();
        return true;
      } finally {
        setTransferRunning(false);
      }
    },
    [activeChat, refreshList, toTransferTarget, transferRunning],
  );

  const handleBackToList = () => {
    setIsProfileOpen(false);
    setSelectedChat(null);
    setSelectedConversationId(undefined);
  };

  const chatWindow = (
    <ChatWindow
      chat={activeChat}
      apiMessages={apiMessages}
      hasOlder={hasOlder}
      loadingOlder={loadingOlder}
      loadOlder={loadOlder}
      historyError={historyError}
      messagesLoading={messagesLoading}
      sending={sending}
      closing={Boolean(activeChat && closingId === activeChat.id)}
      botTyping={botTyping}
      socketConnected={socketConnected}
      currentUserId={user?.id}
      departments={deptState.departments}
      panelUsers={panelUsers}
      usersLoading={usersLoading}
      transferRunning={transferRunning}
      canTransfer={isSupervisor}
      onSend={handleSend}
      onSendAudio={handleSendAudio}
      onCloseConversation={handleCloseConversation}
      onTransfer={activeChat ? handleTransfer : undefined}
      onBack={handleBackToList}
      profileAction={
        <SheetTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 xl:hidden">
            <User className="size-4" aria-hidden />
            Ver perfil
          </Button>
        </SheetTrigger>
      }
    />
  );

  const list = (
    <ChatList
      selectedId={activeChat?.id ?? null}
      onSelect={handleSelectChat}
      conversations={conversations}
      loading={listLoading}
      filters={filters}
      search={searchInput}
      onSearchChange={setSearchInput}
      onApplyFilters={applyFilters}
    />
  );

  return (
    <Sheet open={isProfileOpen} onOpenChange={setIsProfileOpen}>
      <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
        <section
          aria-label="Lista de conversaciones"
          className={`h-full min-h-0 w-full shrink-0 overflow-hidden md:block md:w-64 lg:w-80 ${activeChat ? 'hidden' : 'block'}`}
        >
          {list}
        </section>
        <section
          aria-label="Chat activo"
          className={`h-full min-h-0 min-w-0 flex-1 overflow-hidden md:flex ${activeChat ? 'flex' : 'hidden'}`}
        >
          {chatWindow}
        </section>
        <aside
          aria-label="Perfil del ciudadano"
          className="hidden h-full min-h-0 w-80 shrink-0 xl:block"
        >
          {hasProfileColumn && <CitizenProfile citizenId={activeChat?.citizen.id} />}
        </aside>
      </div>
      <SheetContent className="h-dvh max-h-dvh w-full gap-0 overflow-hidden p-0 sm:max-w-sm [&>button]:text-foreground [&>button>svg]:text-current">
        <SheetHeader className="sr-only">
          <SheetTitle>Perfil del ciudadano</SheetTitle>
          <SheetDescription>
            Información y tickets del ciudadano de la conversación activa.
          </SheetDescription>
        </SheetHeader>
        {activeChat && !hasProfileColumn && <CitizenProfile citizenId={activeChat.citizen.id} />}
      </SheetContent>
    </Sheet>
  );
}
