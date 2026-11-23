import { PromovidosIntakeView } from '@/components/admin/promovidos-intake-view';
import { PermissionGate } from '@/components/auth/PermissionGate';

export default function PromovidosPage() {
  return (
    <PermissionGate
      permission="promovidos.view"
      fallback={
        <p className="p-6 text-sm text-muted-foreground">
          No tenés permiso para gestionar promovidos.
        </p>
      }
    >
      <PromovidosIntakeView />
    </PermissionGate>
  );
}
