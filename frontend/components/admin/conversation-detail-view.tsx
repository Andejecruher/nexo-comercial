'use client';

import { AssignmentPanel } from '@/components/domain/conversations/AssignmentPanel';
import { ConversationThread } from '@/components/domain/conversations/ConversationThread';
import { HandoverActions } from '@/components/domain/conversations/HandoverActions';
import {
  TransferButton,
  type TransferDestinationType,
} from '@/components/domain/conversations/TransferButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAssignments } from '@/hooks/useAssignments';
import { useAuth } from '@/hooks/useAuth';
import { useConversationThread } from '@/hooks/useConversationThread';
import { useDepartments } from '@/hooks/useDepartments';
import { usePermissions } from '@/hooks/usePermissions';
import { adminUsersApi, type PanelUserDto } from '@/lib/admin-users-api';
import { FLOW_STATE_LABELS, type ConversationFlowState } from '@/lib/conversation-fsm';
import { getConversationActionFlags } from '@/lib/conversation-ui-actions';
import type { TransferTarget } from '@/lib/conversations-api';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface ConversationDetailViewProps {
  conversationId: string;
}

export function ConversationDetailView({ conversationId }: ConversationDetailViewProps) {
  const { user } = useAuth();
  const { roles } = usePermissions();
  const deptState = useDepartments({ pageSize: 100 });

  const {
    conversation: conv,
    messages,
    hasOlder,
    loadingOlder,
    loadOlder,
    historyError,
    loading,
    messagesLoading,
    aiDraftText,
    error,
    sending,
    refresh,
    sendMessage,
  } = useConversationThread(conversationId);

  const isSupervisor = useMemo(
    () => roles.some((r) => r === 'COORDINADOR' || r === 'SUPER_ADMIN'),
    [roles],
  );

  const [panelUsers, setPanelUsers] = useState<PanelUserDto[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | undefined>(undefined);

  const refreshAll = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const assignments = useAssignments(conversationId, refreshAll);

  useEffect(() => {
    if (!isSupervisor) {
      setPanelUsers([]);
      return;
    }
    let cancelled = false;
    setUsersLoading(true);
    setUsersError(undefined);
    void (async () => {
      const res = await adminUsersApi.list();
      if (cancelled) return;
      setUsersLoading(false);
      if (res.ok) {
        setPanelUsers(res.data.users);
      } else {
        setUsersError(res.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSupervisor]);

  const flowState: ConversationFlowState = conv?.meta?.flowState ?? 'BOT_FLOW';

  const flags = useMemo(() => {
    return getConversationActionFlags({
      flowState,
      status: conv?.status ?? 'open',
      assignedUserId: conv?.assignedUserId ?? undefined,
      currentUserId: user?.id,
      isSupervisor,
    });
  }, [conv?.assignedUserId, conv?.status, flowState, isSupervisor, user?.id]);

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
    (type: TransferDestinationType, targetId: string) =>
      assignments.transfer(toTransferTarget(type, targetId)),
    [assignments, toTransferTarget],
  );

  if (error && !conv) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-destructive">{error}</p>
        <Button onClick={() => void refresh()}>Reintentar</Button>
        <Button asChild variant="outline">
          <Link href="/admin/conversaciones">Volver al inbox</Link>
        </Button>
      </div>
    );
  }

  if (!conv) {
    return <div className="p-6 text-muted-foreground">Cargando conversación…</div>;
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/conversaciones">← Inbox</Link>
          </Button>
          <h1 className="text-xl font-black text-foreground">
            {conv.citizen.name || 'Ciudadano'}{' '}
            <span className="text-muted-foreground font-mono text-sm">{conv.citizen.phone}</span>
          </h1>
          <div className="flex flex-wrap gap-2 items-center text-sm">
            <Badge variant={conv.status === 'open' ? 'default' : 'secondary'}>
              {conv.status === 'open' ? 'Abierta' : 'Cerrada'}
            </Badge>
            <span className="text-muted-foreground">
              Flujo:{' '}
              <span className="font-semibold text-foreground">{FLOW_STATE_LABELS[flowState]}</span>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {flags.canTransfer && (
            <TransferButton
              departments={deptState.departments}
              panelUsers={panelUsers}
              usersLoading={usersLoading}
              running={assignments.running === 'transfer'}
              onTransfer={handleTransfer}
            />
          )}
          <Button variant="outline" onClick={() => void refreshAll()}>
            Actualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 space-y-4">
          <ConversationThread
            chat={{
              id: conv.id,
              citizen: {
                id: conv.citizen.id,
                name: conv.citizen.name,
                phone: conv.citizen.phone,
                colonia: '',
                interests: [],
                registeredAt: conv.createdAt,
              },
              inboxStatus: 'active',
              conversationStatus: conv.status,
              lastMessage: '',
              lastTime: '',
              unread: 0,
              updatedAt: conv.updatedAt,
              communicationLineId: conv.meta.communicationLineId,
              canClose: true,
            }}
            identity={conversationId}
            hasOlder={hasOlder}
            loadingOlder={loadingOlder}
            loadOlder={loadOlder}
            historyError={historyError}
            messages={messages}
            loading={loading}
            messagesLoading={messagesLoading}
            aiDraftText={aiDraftText}
            canSend={flags.canSendMessage}
            sending={sending}
            onSend={sendMessage}
            currentUserId={user?.id}
          />
        </div>
        <div className="space-y-4">
          <AssignmentPanel
            flags={flags}
            isSupervisor={isSupervisor}
            departments={deptState.departments}
            panelUsers={panelUsers}
            usersLoading={usersLoading}
            usersError={usersError}
            running={assignments.running}
            onAssignSelf={assignments.assignToSelf}
            onAssignUser={assignments.assignToUser}
            onTransfer={assignments.transfer}
          />
          <HandoverActions
            flowState={flowState}
            flags={flags}
            running={assignments.running}
            onHandover={assignments.handover}
            onClose={assignments.close}
            onReopen={assignments.reopen}
          />
        </div>
      </div>
    </div>
  );
}
