import { StructuresView } from '@/components/admin/structures/StructuresView';
import { PermissionGate } from '@/components/auth/PermissionGate';

export default function EstructurasPage() {
  return (
    <PermissionGate
      permission="coordinadores.view"
      fallback={
        <p className="p-6 text-sm text-muted-foreground">
          No tenés permiso para administrar las estructuras.
        </p>
      }
    >
      <StructuresView />
    </PermissionGate>
  );
}
