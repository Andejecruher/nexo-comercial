import { PermissionGate } from '@/components/shared/PermissionGate';
import { TemplatesPage } from '@/components/plantillas/TemplatesPage';
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
