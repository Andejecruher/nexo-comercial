import { TeamView } from '@/components/admin/team/TeamView';
import { PermissionGate } from '@/components/auth/PermissionGate';

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
