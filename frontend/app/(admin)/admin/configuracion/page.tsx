import { SettingsView } from '@/components/admin/settings-view';
import { PermissionGate } from '@/components/auth/PermissionGate';

export default function AdminSettingsPage() {
  return (
    <PermissionGate
      permission="configuracion.view"
      fallback={
        <div className="h-full p-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h1 className="text-xl font-black text-foreground">Acceso restringido</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Necesitás el permiso manage:settings para administrar Configuraciones.
            </p>
          </div>
        </div>
      }
    >
      <div className="h-full">
        <SettingsView />
      </div>
    </PermissionGate>
  );
}
