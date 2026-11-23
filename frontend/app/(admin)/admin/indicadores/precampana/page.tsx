import { DashboardViewPrecampana } from '@/components/admin/dashboard-view-precampana';
import { PermissionGate } from '@/components/auth/PermissionGate';

export default function DashboardPage() {
  return (
    <PermissionGate
      permission="indicadores_precampana.view"
      fallback={
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">No tenés permiso para ver esta sección.</p>
        </div>
      }
    >
      <DashboardViewPrecampana />
    </PermissionGate>
  );
}
