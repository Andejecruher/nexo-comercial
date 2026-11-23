import { EventDetailView } from '@/components/admin/event-detail-view';
import { PermissionGate } from '@/components/auth/PermissionGate';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminEventoDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <PermissionGate
      permission="eventos.view"
      fallback={
        <div className="flex h-full items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">No tenés permiso para ver este evento.</p>
        </div>
      }
    >
      <div className="h-full min-h-0 overflow-y-auto">
        <EventDetailView eventId={id} />
      </div>
    </PermissionGate>
  );
}
