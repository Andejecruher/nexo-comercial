import { DashboardViewAtencion } from '@/components/indicadores/dashboard-view-atencion';
import { PermissionGate } from '@/components/shared/PermissionGate';

export default function DashboardPage() {
  return (
    <PermissionGate
      permission="indicadores_atencion.view"
      fallback={
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">No tenés permiso para ver esta sección.</p>
        </div>
      }
    >
      <DashboardViewAtencion />
    </PermissionGate>
  );
}
