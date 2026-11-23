import { PermissionGate } from '@/components/auth/PermissionGate';
import { TicketsListView } from '@/components/tickets/TicketsListView';

export default function AdminTicketsPage() {
  return (
    <PermissionGate
      permission="tickets.view"
      fallback={
        <div className="flex h-full items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">No tenés permiso para ver los tickets.</p>
        </div>
      }
    >
      <div className="h-full">
        <TicketsListView />
      </div>
    </PermissionGate>
  );
}
