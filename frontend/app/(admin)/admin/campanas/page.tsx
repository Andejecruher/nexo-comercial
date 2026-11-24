import { PermissionGate } from '@/components/shared/PermissionGate';
import { CampaignList } from '@/components/campanas/CampaignPages';
export default function Page() {
  return (
    <PermissionGate
      permission="campanas_whatsapp.view"
      fallback={<p>No tienes permiso para ver campañas.</p>}
    >
      <CampaignList />
    </PermissionGate>
  );
}
