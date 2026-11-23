import { PermissionGate } from '@/components/auth/PermissionGate';
import { TemplatesPage } from '@/components/templates/TemplatesPage';
export default function Page() {
  return (
    <PermissionGate
      permission="plantillas.view"
      fallback={<p>No tienes permiso para ver las plantillas.</p>}
    >
      <TemplatesPage />
    </PermissionGate>
  );
}
