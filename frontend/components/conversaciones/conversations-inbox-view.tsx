'use client';

import { ConversationFilters } from '@/components/conversaciones/ConversationFilters';
import { ConversationInbox } from '@/components/conversaciones/ConversationInbox';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/shared/useAuth';
import { useConversations } from '@/hooks/conversaciones/useConversations';
import { useDepartments } from '@/hooks/shared/useDepartments';

export function ConversationsInboxView() {
  const { user } = useAuth();
  const deptState = useDepartments({ pageSize: 100 });
  const conv = useConversations(user?.id);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-foreground">Bandeja de atención ciudadana</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {conv.items.length} conversaciones visibles con los filtros actuales
            </p>
          </div>
          <Button variant="outline" onClick={conv.refresh}>
            Actualizar
          </Button>
        </div>

        <ConversationFilters
          status={conv.filters.status}
          assignment={conv.filters.assignment}
          flowState={conv.filters.flowState}
          departmentSlug={conv.filters.departmentSlug}
          departments={deptState.departments}
          onStatusChange={conv.setStatusFilter}
          onAssignmentChange={conv.setAssignmentFilter}
          onFlowStateChange={conv.setFlowStateFilter}
          onDepartmentChange={conv.setDepartmentSlug}
          onClear={conv.clearFilters}
        />

        <ConversationInbox
          items={conv.items}
          loading={conv.loading}
          hasNextPage={conv.hasNextPage}
          loadingMore={conv.loadingMore}
          onLoadMore={conv.loadMore}
        />
      </div>
    </div>
  );
}
