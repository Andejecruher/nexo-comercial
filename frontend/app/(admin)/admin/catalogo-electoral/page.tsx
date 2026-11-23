import { ElectoralCatalogView } from '@/components/admin/electoral-catalog-view';
import { PermissionGate } from '@/components/auth/PermissionGate';

export default function ElectoralCatalogPage() {
  return (
    <PermissionGate
      roles={['SUPER_ADMIN']}
      fallback={
        <p className="p-6 text-sm text-muted-foreground">
          No tenés permiso para administrar el catálogo electoral.
        </p>
      }
    >
      <ElectoralCatalogView />
    </PermissionGate>
  );
}
