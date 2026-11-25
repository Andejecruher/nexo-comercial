import { PermissionGate } from '@/components/shared/PermissionGate';
import { TicketDetailLayout } from '@/components/tickets/TicketDetailLayout';

interface TicketDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminTicketDetailPage({ params }: TicketDetailPageProps) {
  const { id } = await params;

  return (
    <PermissionGate
      permission="tickets.view"
      fallback={
        <div className="flex h-full items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">No tenés permiso para ver este ticket.</p>
        </div>
      }
    >
      <div className="absolute inset-0 overflow-hidden">
        <TicketDetailLayout ticketId={id} />
      </div>
    </PermissionGate>
  );
}
