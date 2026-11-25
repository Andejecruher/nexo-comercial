import { EventsView } from '@/components/eventos/events-view';
import { PermissionGate } from '@/components/shared/PermissionGate';

export default function AdminEventosPage() {
  return (
    <PermissionGate
      permission="eventos.view"
      fallback={
        <div className="flex h-full items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">No tenés permiso para ver eventos.</p>
        </div>
      }
    >
      <div className="h-full">
        <EventsView />
      </div>
    </PermissionGate>
  );
}
