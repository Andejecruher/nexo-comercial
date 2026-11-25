import { TeamView } from '@/components/equipo/TeamView';
import { PermissionGate } from '@/components/shared/PermissionGate';

export default function AdminTeamPage() {
  return (
    <PermissionGate
      permission="users.view"
      fallback={<div className="p-6">No tenés permisos para ver Equipo.</div>}
    >
      <TeamView />
    </PermissionGate>
  );
}
