import { PermissionGate } from '@/components/shared/PermissionGate';
import { CampaignAnalytics } from '@/components/campanas/CampaignPages';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PermissionGate
      permission="campanas_whatsapp.view"
      fallback={<p>No tienes permiso para ver campañas.</p>}
    >
      <CampaignAnalytics id={id} />
    </PermissionGate>
  );
}
