import { PermissionGate } from '@/components/auth/PermissionGate';
import { CampaignWizard } from '@/components/campaigns/CampaignWizard';
export default function Page() {
  return (
    <PermissionGate
      permission="campanas_whatsapp.create"
      fallback={<p>No tienes permiso para crear campañas.</p>}
    >
      <PermissionGate
        permission="plantillas.view"
        fallback={<p>Necesitas permiso para ver plantillas.</p>}
      >
        <CampaignWizard />
      </PermissionGate>
    </PermissionGate>
  );
}
