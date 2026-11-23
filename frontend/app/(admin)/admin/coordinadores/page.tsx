import { CoordinatorsView } from '@/components/admin/coordinators/CoordinatorsView';
import { PermissionGate } from '@/components/auth/PermissionGate';

export default function CoordinadoresPage() {
  return (
    <PermissionGate
      permission="coordinadores.view"
      fallback={
        <p className="p-6 text-sm text-muted-foreground">
          No tenés permiso para administrar los coordinadores.
        </p>
      }
    >
      <CoordinatorsView />
    </PermissionGate>
  );
}
