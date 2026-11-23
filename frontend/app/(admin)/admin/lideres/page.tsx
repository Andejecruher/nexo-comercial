import { LeadersView } from '@/components/admin/leaders/LeadersView';
import { PermissionGate } from '@/components/auth/PermissionGate';

export default function LideresPage() {
  return (
    <PermissionGate
      permission="lideres.view"
      fallback={
        <p className="p-6 text-sm text-muted-foreground">
          No tenés permiso para administrar los líderes.
        </p>
      }
    >
      <LeadersView />
    </PermissionGate>
  );
}
